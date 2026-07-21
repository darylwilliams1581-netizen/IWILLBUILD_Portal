import{createRequire as L}from"module";import{d as N}from"../server.bundle.mjs";import{s as A}from"./drizzle-CZ2vWAZ3.js";import"./express-C3pMhyZZ.js";import"tty";import"os";import"util";import"path";import"./iconv-DatUeE_T.js";import"buffer";import"string_decoder";import"node:zlib";import"./es-abstract-B57Whf45.js";import"url";import"node:fs";import"node:path";import"fs";import"crypto";import"node:http";import"node:buffer";import"node:querystring";import"node:net";import"stream";import"node:events";import"./mysql2-HVwznT_d.js";import"net";import"events";import"process";import"timers";import"tls";import"zlib";import"node:process";import"./better-auth-B2r-Xofv.js";import"./kysely-9kO2vj_T.js";import"node:crypto";import"./noble-DY0vnRA-.js";import"node:fs/promises";import"node:os";import"./multer-RX-gfMuA.js";import"fs/promises";import"./jszip-BoIs7TcQ.js";import"node:util";import"http";import"https";import"assert";const s=L(import.meta.url);async function ai(m,a){const t=[];async function i(r,E){try{await N.execute(A.raw(E)),t.push(`✅ ${r}`)}catch(_){const e=String(_);e.includes("Duplicate")||e.includes("already exists")||e.includes("Multiple primary key")?t.push(`⚠️  ${r}: already exists`):t.push(`❌ ${r}: ${e.slice(0,200)}`)}}await i("Create library_items",`
    CREATE TABLE IF NOT EXISTS library_items (
      id              INT PRIMARY KEY AUTO_INCREMENT,
      type            VARCHAR(50)  NOT NULL,
      category        VARCHAR(100) NULL,
      title           VARCHAR(255) NOT NULL,
      summary         TEXT         NULL,
      tags            TEXT         NULL,
      discipline      VARCHAR(100) NULL,
      version         VARCHAR(30)  NOT NULL DEFAULT '1.0',
      status          VARCHAR(30)  NOT NULL DEFAULT 'active',
      visibility      VARCHAR(30)  NOT NULL DEFAULT 'public',
      content         LONGTEXT     NULL,
      metadata_json   TEXT         NULL,
      source_links    TEXT         NULL,
      owner_user_id   VARCHAR(36)  NULL,
      install_count   INT          NOT NULL DEFAULT 0,
      download_count  INT          NOT NULL DEFAULT 0,
      rating_count    INT          NOT NULL DEFAULT 0,
      rating_sum      INT          NOT NULL DEFAULT 0,
      created_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
      updated_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_lib_visibility  (visibility),
      INDEX idx_lib_type        (type),
      INDEX idx_lib_category    (category),
      INDEX idx_lib_updated_at  (updated_at),
      INDEX idx_lib_owner       (owner_user_id),
      INDEX idx_lib_install_cnt (install_count)
    )
  `),await i("Create company_library_items",`
    CREATE TABLE IF NOT EXISTS company_library_items (
      id                INT PRIMARY KEY AUTO_INCREMENT,
      company_id        INT          NOT NULL,
      source_item_id    INT          NOT NULL,
      source_version    VARCHAR(30)  NOT NULL DEFAULT '1.0',
      type              VARCHAR(50)  NOT NULL,
      category          VARCHAR(100) NULL,
      title             VARCHAR(255) NOT NULL,
      content           LONGTEXT     NULL,
      metadata_json     TEXT         NULL,
      installed_by      VARCHAR(36)  NULL,
      installed_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
      updated_at        TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      update_available  TINYINT(1)   NOT NULL DEFAULT 0,
      FOREIGN KEY (company_id)     REFERENCES companies(id)     ON DELETE CASCADE,
      FOREIGN KEY (source_item_id) REFERENCES library_items(id) ON DELETE RESTRICT,
      INDEX idx_cli_company    (company_id),
      INDEX idx_cli_source     (source_item_id),
      INDEX idx_cli_type       (type),
      INDEX idx_cli_updated_at (updated_at),
      UNIQUE KEY uq_cli_company_source (company_id, source_item_id)
    )
  `),await i("Create library_feedback",`
    CREATE TABLE IF NOT EXISTS library_feedback (
      id             INT PRIMARY KEY AUTO_INCREMENT,
      item_id        INT          NOT NULL,
      company_id     INT          NOT NULL,
      user_id        VARCHAR(36)  NULL,
      rating         TINYINT      NOT NULL DEFAULT 0,
      comment        TEXT         NULL,
      created_at     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (item_id)    REFERENCES library_items(id) ON DELETE CASCADE,
      FOREIGN KEY (company_id) REFERENCES companies(id)     ON DELETE CASCADE,
      UNIQUE KEY uq_feedback_company_item (company_id, item_id)
    )
  `),await i("Add FULLTEXT index on library_items (title, summary, tags)",`
    ALTER TABLE library_items
      ADD FULLTEXT INDEX ft_lib_search (title, summary, tags)
  `),await i("Add builder_json to library_items",`
    ALTER TABLE library_items ADD COLUMN builder_json LONGTEXT NULL
  `),await i("Add file_path to library_items",`
    ALTER TABLE library_items ADD COLUMN file_path VARCHAR(500) NULL
  `),await i("Add file_mime to library_items",`
    ALTER TABLE library_items ADD COLUMN file_mime VARCHAR(100) NULL
  `),await i("Add source_file_name to library_items",`
    ALTER TABLE library_items ADD COLUMN source_file_name VARCHAR(255) NULL
  `),await i("Add submitted_by_company_id to library_items",`
    ALTER TABLE library_items ADD COLUMN submitted_by_company_id INT NULL
  `),await i("Add submitted_by_user_id to library_items",`
    ALTER TABLE library_items ADD COLUMN submitted_by_user_id VARCHAR(36) NULL
  `),await i("Add reviewer_notes to library_items",`
    ALTER TABLE library_items ADD COLUMN reviewer_notes TEXT NULL
  `),await i("Add reviewed_at to library_items",`
    ALTER TABLE library_items ADD COLUMN reviewed_at TIMESTAMP NULL
  `),await i("Add reviewed_by to library_items",`
    ALTER TABLE library_items ADD COLUMN reviewed_by VARCHAR(36) NULL
  `),await i("Add index on visibility+status",`
    ALTER TABLE library_items ADD INDEX idx_lib_vis_status (visibility, status)
  `);const T=t.every(r=>!r.startsWith("❌"));a.json({ok:T,results:t})}export{ai as default};
