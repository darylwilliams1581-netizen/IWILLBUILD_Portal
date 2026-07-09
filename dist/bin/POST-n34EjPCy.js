import{createRequire as A}from"module";import{d as _}from"../server.bundle.mjs";import{s as o}from"./drizzle-CZ2vWAZ3.js";import"./express-C3pMhyZZ.js";import"tty";import"os";import"util";import"path";import"./iconv-DatUeE_T.js";import"buffer";import"string_decoder";import"node:zlib";import"./es-abstract-B57Whf45.js";import"url";import"node:fs";import"node:path";import"fs";import"crypto";import"node:http";import"node:buffer";import"node:querystring";import"node:net";import"stream";import"node:events";import"./radix-ui-Cfam1uum.js";import"./react-router-5dh9OgMp.js";import"./react-dom-CZsMFu04.js";import"async_hooks";import"./zod-B-vvil1C.js";import"node:url";import"./mysql2-HVwznT_d.js";import"net";import"events";import"process";import"timers";import"tls";import"zlib";import"node:process";import"./better-auth-B2r-Xofv.js";import"./kysely-9kO2vj_T.js";import"node:crypto";import"./noble-DY0vnRA-.js";import"node:fs/promises";import"node:os";import"./multer-3TLq-S4Z.js";import"fs/promises";import"./jszip-BZ8kuIwR.js";import"node:util";import"http";import"https";import"assert";const d=A(import.meta.url);async function oT(U,e){const i=[];async function T(t,a){try{await _.execute(o.raw(a)),i.push(`✓ ${t}`)}catch(E){const N=String((E==null?void 0:E.message)??E);N.includes("already exists")||N.includes("Duplicate column name")||N.includes("ER_TABLE_EXISTS")||N.includes("ER_DUP_FIELDNAME")?i.push(`~ ${t} (already exists)`):(i.push(`✗ ${t}: ${N}`),console.warn(`[migrate-asset-manager] ${t} failed:`,N))}}await T("am_assets",`
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
  `);const L=i.filter(t=>t.startsWith("✗"));return e.status(L.length?500:200).json({results:i,ok:L.length===0})}export{oT as default};
