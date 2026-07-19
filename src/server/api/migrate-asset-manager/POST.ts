/**
 * POST /api/migrate-asset-manager
 * Idempotent migration — creates all Asset Manager tables if they don't exist.
 */
import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';

export default async function handler(_req: Request, res: Response) {
  const results: string[] = [];

  async function run(name: string, ddl: string) {
    try {
      await db.execute(sql.raw(ddl));
      results.push(`✓ ${name}`);
    } catch (e: unknown) {
      const msg = String((e as Error)?.message ?? e);
      if (
        msg.includes('already exists') ||
        msg.includes('Duplicate column name') ||
        msg.includes('ER_TABLE_EXISTS') ||
        msg.includes('ER_DUP_FIELDNAME')
      ) {
        results.push(`~ ${name} (already exists)`);
      } else {
        results.push(`✗ ${name}: ${msg}`);
        console.warn(`[migrate-asset-manager] ${name} failed:`, msg);
      }
    }
  }

  // ── am_assets ──────────────────────────────────────────────────────────────
  await run('am_assets', `
    CREATE TABLE IF NOT EXISTS am_assets (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      company_id    INT NOT NULL,
      name          VARCHAR(255) NOT NULL,
      acronym       VARCHAR(50)  NULL,
      address       TEXT         NULL,
      asset_type    VARCHAR(100) NOT NULL DEFAULT 'facility',
      status        VARCHAR(50)  NOT NULL DEFAULT 'active',
      archived_at   DATETIME     NULL,
      created_by    VARCHAR(36)  NULL,
      created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_company (company_id),
      INDEX idx_status  (status)
    )
  `);

  // ── am_inspections ─────────────────────────────────────────────────────────
  await run('am_inspections', `
    CREATE TABLE IF NOT EXISTS am_inspections (
      id               INT AUTO_INCREMENT PRIMARY KEY,
      asset_id         INT          NOT NULL,
      company_id       INT          NOT NULL,
      report_no        VARCHAR(100) NULL,
      inspection_date  DATE         NULL,
      report_title     VARCHAR(255) NULL,
      overall_status   VARCHAR(50)  NOT NULL DEFAULT 'pending',
      notes            TEXT         NULL,
      archived_at      DATETIME     NULL,
      created_by       VARCHAR(36)  NULL,
      created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_company   (company_id),
      INDEX idx_asset     (asset_id),
      INDEX idx_archived  (archived_at)
    )
  `);

  // ── am_defects ─────────────────────────────────────────────────────────────
  await run('am_defects', `
    CREATE TABLE IF NOT EXISTS am_defects (
      id               INT AUTO_INCREMENT PRIMARY KEY,
      inspection_id    INT          NOT NULL,
      company_id       INT          NOT NULL,
      title            VARCHAR(255) NOT NULL,
      severity         VARCHAR(50)  NOT NULL DEFAULT 'medium',
      location         VARCHAR(255) NULL,
      description      TEXT         NULL,
      action_owner_id  VARCHAR(36)  NULL,
      due_date         DATE         NULL,
      status           VARCHAR(50)  NOT NULL DEFAULT 'open',
      archived_at      DATETIME     NULL,
      created_by       VARCHAR(36)  NULL,
      created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_company      (company_id),
      INDEX idx_inspection   (inspection_id),
      INDEX idx_status       (status)
    )
  `);

  // ── am_tender_cycles ───────────────────────────────────────────────────────
  await run('am_tender_cycles', `
    CREATE TABLE IF NOT EXISTS am_tender_cycles (
      id                  INT AUTO_INCREMENT PRIMARY KEY,
      inspection_id       INT          NOT NULL,
      asset_id            INT          NOT NULL,
      company_id          INT          NOT NULL,
      code                VARCHAR(100) NULL,
      quote_requested_at  DATE         NULL,
      quote_due_at        DATE         NULL,
      contractor_name     VARCHAR(255) NULL,
      quote_amount        DECIMAL(12,2) NULL,
      award_status        VARCHAR(50)  NOT NULL DEFAULT 'pending',
      notes               TEXT         NULL,
      archived_at         DATETIME     NULL,
      created_by          VARCHAR(36)  NULL,
      created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_company     (company_id),
      INDEX idx_inspection  (inspection_id)
    )
  `);

  // ── am_contract_submissions ────────────────────────────────────────────────
  await run('am_contract_submissions', `
    CREATE TABLE IF NOT EXISTS am_contract_submissions (
      id                INT AUTO_INCREMENT PRIMARY KEY,
      tender_cycle_id   INT          NOT NULL,
      company_id        INT          NOT NULL,
      contractor_name   VARCHAR(255) NULL,
      submitted_at      DATETIME     NULL,
      status            VARCHAR(50)  NOT NULL DEFAULT 'received',
      received_by       VARCHAR(36)  NULL,
      notes             TEXT         NULL,
      created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_company (company_id),
      INDEX idx_tender  (tender_cycle_id)
    )
  `);

  // ── am_media ───────────────────────────────────────────────────────────────
  await run('am_media', `
    CREATE TABLE IF NOT EXISTS am_media (
      id             INT AUTO_INCREMENT PRIMARY KEY,
      asset_id       INT          NOT NULL,
      inspection_id  INT          NULL,
      company_id     INT          NOT NULL,
      category       VARCHAR(100) NOT NULL DEFAULT 'general',
      file_path      VARCHAR(500) NOT NULL,
      file_name      VARCHAR(255) NOT NULL,
      mime_type      VARCHAR(100) NULL,
      uploaded_by    VARCHAR(36)  NULL,
      created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_company     (company_id),
      INDEX idx_asset       (asset_id),
      INDEX idx_inspection  (inspection_id)
    )
  `);

  // ── am_closeout_forms ──────────────────────────────────────────────────────
  await run('am_closeout_forms', `
    CREATE TABLE IF NOT EXISTS am_closeout_forms (
      id               INT AUTO_INCREMENT PRIMARY KEY,
      inspection_id    INT          NOT NULL,
      company_id       INT          NOT NULL,
      form_type        VARCHAR(100) NOT NULL DEFAULT 'general',
      source_file_path VARCHAR(500) NULL,
      extracted_json   LONGTEXT     NULL,
      archived_at      DATETIME     NULL,
      created_by       VARCHAR(36)  NULL,
      created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_company     (company_id),
      INDEX idx_inspection  (inspection_id)
    )
  `);

  // ── am_report_shares ───────────────────────────────────────────────────────
  await run('am_report_shares', `
    CREATE TABLE IF NOT EXISTS am_report_shares (
      id             INT AUTO_INCREMENT PRIMARY KEY,
      inspection_id  INT          NOT NULL,
      company_id     INT          NOT NULL,
      token_hash     VARCHAR(255) NOT NULL UNIQUE,
      scope          VARCHAR(100) NOT NULL DEFAULT 'full',
      expires_at     DATETIME     NULL,
      revoked        TINYINT(1)   NOT NULL DEFAULT 0,
      created_by     VARCHAR(36)  NULL,
      created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_company     (company_id),
      INDEX idx_inspection  (inspection_id),
      INDEX idx_token       (token_hash)
    )
  `);

  // ── tender_attachments ─────────────────────────────────────────────────────
  await run('tender_attachments', `
    CREATE TABLE IF NOT EXISTS tender_attachments (
      id              INT AUTO_INCREMENT PRIMARY KEY,
      tender_id       INT          NOT NULL,
      company_id      INT          NOT NULL,
      original_name   VARCHAR(500) NOT NULL,
      stored_name     VARCHAR(500) NOT NULL,
      mime_type       VARCHAR(200) NULL,
      size_bytes      INT          NOT NULL DEFAULT 0,
      uploaded_by     VARCHAR(36)  NULL,
      created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_tender  (tender_id),
      INDEX idx_company (company_id)
    )
  `);

  // ── am_audit_log ───────────────────────────────────────────────────────────
  await run('am_audit_log', `
    CREATE TABLE IF NOT EXISTS am_audit_log (
      id           INT AUTO_INCREMENT PRIMARY KEY,
      entity_type  VARCHAR(100) NOT NULL,
      entity_id    INT          NOT NULL,
      action       VARCHAR(100) NOT NULL,
      actor_id     VARCHAR(36)  NULL,
      details_json TEXT         NULL,
      created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_entity (entity_type, entity_id)
    )
  `);

  // ── am_assets equipment columns (idempotent ALTER) ────────────────────────
  const equipmentAlters: [string, string][] = [
    ['asset_number',       `ALTER TABLE am_assets ADD COLUMN asset_number VARCHAR(100) NULL`],
    ['make',               `ALTER TABLE am_assets ADD COLUMN make VARCHAR(150) NULL`],
    ['model',              `ALTER TABLE am_assets ADD COLUMN model VARCHAR(150) NULL`],
    ['serial_number',      `ALTER TABLE am_assets ADD COLUMN serial_number VARCHAR(150) NULL`],
    ['purchase_or_hire',   `ALTER TABLE am_assets ADD COLUMN purchase_or_hire VARCHAR(20) NOT NULL DEFAULT 'owned'`],
    ['hire_company',       `ALTER TABLE am_assets ADD COLUMN hire_company VARCHAR(255) NULL`],
    ['hire_start_date',    `ALTER TABLE am_assets ADD COLUMN hire_start_date DATE NULL`],
    ['hire_end_date',      `ALTER TABLE am_assets ADD COLUMN hire_end_date DATE NULL`],
    ['condition_rating',   `ALTER TABLE am_assets ADD COLUMN condition_rating VARCHAR(30) NULL`],
    ['current_location',   `ALTER TABLE am_assets ADD COLUMN current_location VARCHAR(255) NULL`],
    ['assigned_job_id',    `ALTER TABLE am_assets ADD COLUMN assigned_job_id INT NULL`],
    ['assigned_person_name',`ALTER TABLE am_assets ADD COLUMN assigned_person_name VARCHAR(255) NULL`],
    ['last_inspection_date',`ALTER TABLE am_assets ADD COLUMN last_inspection_date DATE NULL`],
    ['next_inspection_due', `ALTER TABLE am_assets ADD COLUMN next_inspection_due DATE NULL`],
    ['calibration_due',    `ALTER TABLE am_assets ADD COLUMN calibration_due DATE NULL`],
    ['certificate_expiry', `ALTER TABLE am_assets ADD COLUMN certificate_expiry DATE NULL`],
    ['last_service_date',  `ALTER TABLE am_assets ADD COLUMN last_service_date DATE NULL`],
    ['next_service_date',  `ALTER TABLE am_assets ADD COLUMN next_service_date DATE NULL`],
    ['service_interval_days',`ALTER TABLE am_assets ADD COLUMN service_interval_days INT NULL`],
    ['service_notes',      `ALTER TABLE am_assets ADD COLUMN service_notes TEXT NULL`],
    ['purchase_date',      `ALTER TABLE am_assets ADD COLUMN purchase_date DATE NULL`],
    ['purchase_price',     `ALTER TABLE am_assets ADD COLUMN purchase_price DECIMAL(12,2) NULL`],
  ];
  for (const [col, ddl] of equipmentAlters) {
    await run(`am_assets.${col}`, ddl);
  }

  // ── am_equipment_costs ─────────────────────────────────────────────────────
  await run('am_equipment_costs', `
    CREATE TABLE IF NOT EXISTS am_equipment_costs (
      id             INT AUTO_INCREMENT PRIMARY KEY,
      asset_id       INT           NOT NULL,
      company_id     INT           NOT NULL,
      cost_type      VARCHAR(60)   NOT NULL DEFAULT 'service',
      description    VARCHAR(500)  NOT NULL,
      amount         DECIMAL(12,2) NOT NULL DEFAULT 0,
      cost_date      DATE          NOT NULL,
      supplier       VARCHAR(255)  NULL,
      invoice_ref    VARCHAR(100)  NULL,
      notes          TEXT          NULL,
      created_by     VARCHAR(36)   NULL,
      created_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_asset   (asset_id),
      INDEX idx_company (company_id)
    )
  `);

  // ── am_service_logs ────────────────────────────────────────────────────────
  await run('am_service_logs', `
    CREATE TABLE IF NOT EXISTS am_service_logs (
      id                INT           AUTO_INCREMENT PRIMARY KEY,
      asset_id          INT           NOT NULL,
      company_id        INT           NOT NULL,
      service_type      VARCHAR(60)   NOT NULL DEFAULT 'routine',
      title             VARCHAR(255)  NOT NULL,
      service_date      DATE          NOT NULL,
      next_service_date DATE          NULL,
      provider          VARCHAR(255)  NULL,
      cost              DECIMAL(12,2) NULL,
      notes             TEXT          NULL,
      created_by        VARCHAR(36)   NULL,
      created_at        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_asset   (asset_id),
      INDEX idx_company (company_id)
    )
  `);



  const failed = results.filter(r => r.startsWith('✗'));
  return res.status(failed.length ? 500 : 200).json({ results, ok: failed.length === 0 });
}
