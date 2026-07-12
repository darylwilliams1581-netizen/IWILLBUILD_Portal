import{createRequire as o}from"module";import{d}from"../server.bundle.mjs";import{s as _}from"./drizzle-CZ2vWAZ3.js";import"./express-C3pMhyZZ.js";import"tty";import"os";import"util";import"path";import"./iconv-DatUeE_T.js";import"buffer";import"string_decoder";import"node:zlib";import"./es-abstract-B57Whf45.js";import"url";import"node:fs";import"node:path";import"fs";import"crypto";import"node:http";import"node:buffer";import"node:querystring";import"node:net";import"stream";import"node:events";import"./radix-ui-C6rnOgg1.js";import"./react-router-CkzSIMgX.js";import"./react-dom-CZsMFu04.js";import"async_hooks";import"node:url";import"./mysql2-HVwznT_d.js";import"net";import"events";import"process";import"timers";import"tls";import"zlib";import"node:process";import"./better-auth-B2r-Xofv.js";import"./kysely-9kO2vj_T.js";import"node:crypto";import"./noble-DY0vnRA-.js";import"node:fs/promises";import"node:os";import"./multer-CH1RChRJ.js";import"fs/promises";import"./jszip-DFkTEOyz.js";import"node:util";import"http";import"https";import"assert";const e=o(import.meta.url);async function di(A,E){const t=[];async function i(T,L){try{await d.execute(_.raw(L)),t.push(`✓ ${T}`)}catch(r){const N=String((r==null?void 0:r.message)??r);N.includes("already exists")||N.includes("Duplicate column name")||N.includes("ER_TABLE_EXISTS")||N.includes("ER_DUP_FIELDNAME")?t.push(`~ ${T} (already exists)`):(t.push(`✗ ${T}: ${N}`),console.warn(`[migrate-plan-manager] ${T} failed:`,N))}}await i("project_drawings",`
    CREATE TABLE IF NOT EXISTS project_drawings (
      id                   INT AUTO_INCREMENT PRIMARY KEY,
      company_id           INT          NOT NULL,
      name                 VARCHAR(255) NOT NULL,
      drawing_number       VARCHAR(100) NULL,
      discipline           VARCHAR(100) NULL,
      description          TEXT         NULL,
      status               VARCHAR(50)  NOT NULL DEFAULT 'active',
      current_revision_id  INT          NULL,
      created_by           VARCHAR(36)  NULL,
      created_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_company (company_id),
      INDEX idx_status  (status)
    )
  `),await i("drawing_revisions",`
    CREATE TABLE IF NOT EXISTS drawing_revisions (
      id           INT AUTO_INCREMENT PRIMARY KEY,
      drawing_id   INT          NOT NULL,
      company_id   INT          NOT NULL,
      revision_no  VARCHAR(20)  NOT NULL DEFAULT '0',
      name         VARCHAR(255) NULL,
      source_type  VARCHAR(50)  NOT NULL DEFAULT 'upload',
      file_path    VARCHAR(500) NULL,
      file_name    VARCHAR(255) NULL,
      mime_type    VARCHAR(100) NULL,
      locked       TINYINT(1)   NOT NULL DEFAULT 0,
      uploaded_by  VARCHAR(36)  NULL,
      created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_drawing  (drawing_id),
      INDEX idx_company  (company_id)
    )
  `),await i("drawing_annotations",`
    CREATE TABLE IF NOT EXISTS drawing_annotations (
      id           INT AUTO_INCREMENT PRIMARY KEY,
      drawing_id   INT          NOT NULL,
      revision_id  INT          NULL,
      company_id   INT          NOT NULL,
      type         VARCHAR(50)  NOT NULL DEFAULT 'comment',
      data_json    LONGTEXT     NULL,
      created_by   VARCHAR(36)  NULL,
      created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_drawing (drawing_id),
      INDEX idx_company (company_id)
    )
  `),await i("drawing_share_tokens",`
    CREATE TABLE IF NOT EXISTS drawing_share_tokens (
      id           INT AUTO_INCREMENT PRIMARY KEY,
      drawing_id   INT          NOT NULL,
      company_id   INT          NOT NULL,
      token_hash   VARCHAR(255) NOT NULL UNIQUE,
      scope        VARCHAR(100) NOT NULL DEFAULT 'view',
      expires_at   DATETIME     NULL,
      revoked      TINYINT(1)   NOT NULL DEFAULT 0,
      created_by   VARCHAR(36)  NULL,
      created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_drawing (drawing_id),
      INDEX idx_token   (token_hash)
    )
  `),await i("drawing_audit_log",`
    CREATE TABLE IF NOT EXISTS drawing_audit_log (
      id           INT AUTO_INCREMENT PRIMARY KEY,
      drawing_id   INT          NOT NULL,
      company_id   INT          NOT NULL,
      action       VARCHAR(100) NOT NULL,
      actor_id     VARCHAR(36)  NULL,
      details_json TEXT         NULL,
      created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_drawing (drawing_id),
      INDEX idx_company (company_id)
    )
  `),await i("job_drawing_links",`
    CREATE TABLE IF NOT EXISTS job_drawing_links (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      job_id      INT      NOT NULL,
      drawing_id  INT      NOT NULL,
      company_id  INT      NOT NULL,
      linked_by   VARCHAR(36) NULL,
      created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_job_drawing (job_id, drawing_id),
      INDEX idx_job     (job_id),
      INDEX idx_drawing (drawing_id)
    )
  `);const a=t.filter(T=>T.startsWith("✗"));return E.status(a.length?500:200).json({results:t,ok:a.length===0})}export{di as default};
