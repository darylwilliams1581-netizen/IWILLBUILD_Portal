import{createRequire as _}from"module";import{d as s}from"../server.bundle.mjs";import{s as U}from"./drizzle-CZ2vWAZ3.js";import"./express-C3pMhyZZ.js";import"tty";import"os";import"util";import"path";import"./iconv-DatUeE_T.js";import"buffer";import"string_decoder";import"node:zlib";import"./es-abstract-B57Whf45.js";import"url";import"node:fs";import"node:path";import"fs";import"crypto";import"node:http";import"node:buffer";import"node:querystring";import"node:net";import"stream";import"node:events";import"./radix-ui-DB7-u4XC.js";import"./react-router-5dh9OgMp.js";import"./react-dom-CZsMFu04.js";import"async_hooks";import"node:url";import"./mysql2-HVwznT_d.js";import"net";import"events";import"process";import"timers";import"tls";import"zlib";import"node:process";import"./better-auth-B2r-Xofv.js";import"./kysely-9kO2vj_T.js";import"node:crypto";import"./noble-DY0vnRA-.js";import"node:fs/promises";import"node:os";import"./multer-RX-gfMuA.js";import"fs/promises";import"./jszip-BoIs7TcQ.js";import"node:util";import"http";import"https";import"assert";const o=_(import.meta.url);async function sT(R,E){const t=[];async function T(L,A){try{await s.execute(U.raw(A)),t.push(`✓ ${L}`)}catch(N){const e=String((N==null?void 0:N.message)??N);e.includes("already exists")||e.includes("Duplicate column name")||e.includes("ER_TABLE_EXISTS")||e.includes("ER_DUP_FIELDNAME")?t.push(`~ ${L} (already exists)`):(t.push(`✗ ${L}: ${e}`),console.warn(`[migrate-asset-manager] ${L} failed:`,e))}}await T("am_assets",`
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
  `),await T("am_inspections",`
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
  `),await T("am_defects",`
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
  `),await T("am_tender_cycles",`
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
  `),await T("am_contract_submissions",`
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
  `),await T("am_media",`
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
  `),await T("am_closeout_forms",`
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
  `),await T("am_report_shares",`
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
  `),await T("tender_attachments",`
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
  `),await T("am_audit_log",`
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
  `);const i=[["asset_number","ALTER TABLE am_assets ADD COLUMN asset_number VARCHAR(100) NULL"],["make","ALTER TABLE am_assets ADD COLUMN make VARCHAR(150) NULL"],["model","ALTER TABLE am_assets ADD COLUMN model VARCHAR(150) NULL"],["serial_number","ALTER TABLE am_assets ADD COLUMN serial_number VARCHAR(150) NULL"],["purchase_or_hire","ALTER TABLE am_assets ADD COLUMN purchase_or_hire VARCHAR(20) NOT NULL DEFAULT 'owned'"],["hire_company","ALTER TABLE am_assets ADD COLUMN hire_company VARCHAR(255) NULL"],["hire_start_date","ALTER TABLE am_assets ADD COLUMN hire_start_date DATE NULL"],["hire_end_date","ALTER TABLE am_assets ADD COLUMN hire_end_date DATE NULL"],["condition_rating","ALTER TABLE am_assets ADD COLUMN condition_rating VARCHAR(30) NULL"],["current_location","ALTER TABLE am_assets ADD COLUMN current_location VARCHAR(255) NULL"],["assigned_job_id","ALTER TABLE am_assets ADD COLUMN assigned_job_id INT NULL"],["assigned_person_name","ALTER TABLE am_assets ADD COLUMN assigned_person_name VARCHAR(255) NULL"],["last_inspection_date","ALTER TABLE am_assets ADD COLUMN last_inspection_date DATE NULL"],["next_inspection_due","ALTER TABLE am_assets ADD COLUMN next_inspection_due DATE NULL"],["calibration_due","ALTER TABLE am_assets ADD COLUMN calibration_due DATE NULL"],["certificate_expiry","ALTER TABLE am_assets ADD COLUMN certificate_expiry DATE NULL"],["last_service_date","ALTER TABLE am_assets ADD COLUMN last_service_date DATE NULL"],["next_service_date","ALTER TABLE am_assets ADD COLUMN next_service_date DATE NULL"],["service_interval_days","ALTER TABLE am_assets ADD COLUMN service_interval_days INT NULL"],["service_notes","ALTER TABLE am_assets ADD COLUMN service_notes TEXT NULL"],["purchase_date","ALTER TABLE am_assets ADD COLUMN purchase_date DATE NULL"],["purchase_price","ALTER TABLE am_assets ADD COLUMN purchase_price DECIMAL(12,2) NULL"],["notes","ALTER TABLE am_assets ADD COLUMN notes TEXT NULL"],["container_id","ALTER TABLE am_assets ADD COLUMN container_id INT NULL"]];for(const[L,A]of i)await T(`am_assets.${L}`,A);await T("am_equipment_costs",`
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
  `),await T("am_service_logs",`
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
  `);const a=t.filter(L=>L.startsWith("✗"));return E.status(a.length?500:200).json({results:t,ok:a.length===0})}export{sT as default};
