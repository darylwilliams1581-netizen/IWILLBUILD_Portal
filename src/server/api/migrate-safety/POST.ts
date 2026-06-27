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
      if (msg.includes('already exists') || msg.includes('ER_TABLE_EXISTS') || msg.includes('ER_DUP_FIELDNAME')) {
        results.push(`~ ${name} (already exists)`);
      } else {
        results.push(`✗ ${name}: ${msg}`);
        console.warn(`[migrate-safety] ${name} failed:`, msg);
      }
    }
  }

  await run('swms_templates', `
    CREATE TABLE IF NOT EXISTS swms_templates (
      id                    INT AUTO_INCREMENT PRIMARY KEY,
      company_id            INT NOT NULL,
      title                 VARCHAR(255) NOT NULL,
      work_activity         TEXT NULL,
      hazards               TEXT NULL,
      risks                 TEXT NULL,
      controls              TEXT NULL,
      ppe                   TEXT NULL,
      plant_equipment       TEXT NULL,
      training_competency   TEXT NULL,
      emergency_controls    TEXT NULL,
      environmental_controls TEXT NULL,
      sign_off_requirements TEXT NULL,
      revision_number       VARCHAR(20) NOT NULL DEFAULT '1',
      review_date           DATE NULL,
      status                VARCHAR(30) NOT NULL DEFAULT 'draft',
      created_by_user_id    VARCHAR(36) NULL,
      created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_company (company_id)
    )
  `);

  await run('safety_plans', `
    CREATE TABLE IF NOT EXISTS safety_plans (
      id                        INT AUTO_INCREMENT PRIMARY KEY,
      company_id                INT NOT NULL,
      job_id                    INT NULL,
      title                     VARCHAR(255) NOT NULL,
      project_value             DECIMAL(15,2) NULL,
      is_principal_contractor   TINYINT(1) NOT NULL DEFAULT 0,
      site_address              TEXT NULL,
      site_supervisor           VARCHAR(255) NULL,
      first_aid_officer         VARCHAR(255) NULL,
      emergency_contact         TEXT NULL,
      nearest_hospital          VARCHAR(255) NULL,
      emergency_assembly_point  TEXT NULL,
      evacuation_notes          TEXT NULL,
      site_rules                TEXT NULL,
      high_risk_activities      TEXT NULL,
      required_posters          TEXT NULL,
      status                    VARCHAR(30) NOT NULL DEFAULT 'draft',
      created_by_user_id        VARCHAR(36) NULL,
      created_at                DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at                DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_company (company_id),
      INDEX idx_job (job_id)
    )
  `);

  await run('job_swms', `
    CREATE TABLE IF NOT EXISTS job_swms (
      id                  INT AUTO_INCREMENT PRIMARY KEY,
      company_id          INT NOT NULL,
      job_id              INT NOT NULL,
      swms_template_id    INT NOT NULL,
      assigned_by_user_id VARCHAR(36) NULL,
      created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_company (company_id),
      INDEX idx_job (job_id)
    )
  `);

  await run('swms_signoffs', `
    CREATE TABLE IF NOT EXISTS swms_signoffs (
      id                INT AUTO_INCREMENT PRIMARY KEY,
      job_swms_id       INT NOT NULL,
      company_id        INT NOT NULL,
      worker_name       VARCHAR(255) NOT NULL,
      white_card_number VARCHAR(100) NULL,
      signature_data    LONGTEXT NULL,
      signed_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_job_swms (job_swms_id),
      INDEX idx_company (company_id)
    )
  `);

  await run('safety_documents', `
    CREATE TABLE IF NOT EXISTS safety_documents (
      id                  INT AUTO_INCREMENT PRIMARY KEY,
      company_id          INT NOT NULL,
      title               VARCHAR(255) NOT NULL,
      doc_type            VARCHAR(60) NOT NULL DEFAULT 'policy',
      original_name       VARCHAR(255) NOT NULL,
      stored_name         VARCHAR(255) NOT NULL,
      mime_type           VARCHAR(100) NOT NULL,
      size_bytes          INT NOT NULL DEFAULT 0,
      review_date         DATE NULL,
      notes               TEXT NULL,
      uploaded_by_user_id VARCHAR(36) NULL,
      created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_company (company_id)
    )
  `);

  await run('safety_posters', `
    CREATE TABLE IF NOT EXISTS safety_posters (
      id                  INT AUTO_INCREMENT PRIMARY KEY,
      company_id          INT NOT NULL,
      title               VARCHAR(255) NOT NULL,
      poster_type         VARCHAR(60) NOT NULL DEFAULT 'general',
      original_name       VARCHAR(255) NOT NULL,
      stored_name         VARCHAR(255) NOT NULL,
      mime_type           VARCHAR(100) NOT NULL,
      size_bytes          INT NOT NULL DEFAULT 0,
      notes               TEXT NULL,
      uploaded_by_user_id VARCHAR(36) NULL,
      created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_company (company_id)
    )
  `);

  await run('safety_registers', `
    CREATE TABLE IF NOT EXISTS safety_registers (
      id           INT AUTO_INCREMENT PRIMARY KEY,
      company_id   INT NOT NULL,
      register_type VARCHAR(60) NOT NULL,
      title        VARCHAR(255) NOT NULL,
      data_json    LONGTEXT NULL,
      created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_company (company_id)
    )
  `);

  res.json({ ok: true, results });
}
