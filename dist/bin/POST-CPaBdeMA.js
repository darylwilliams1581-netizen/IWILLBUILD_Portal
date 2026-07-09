import{createRequire as a}from"module";import{d as m}from"../server.bundle.mjs";import{s as _}from"./drizzle-CZ2vWAZ3.js";import"./express-C3pMhyZZ.js";import"tty";import"os";import"util";import"path";import"./iconv-DatUeE_T.js";import"buffer";import"string_decoder";import"node:zlib";import"./es-abstract-B57Whf45.js";import"url";import"node:fs";import"node:path";import"fs";import"crypto";import"node:http";import"node:buffer";import"node:querystring";import"node:net";import"stream";import"node:events";import"./radix-ui-Cfam1uum.js";import"./react-router-5dh9OgMp.js";import"./react-dom-CZsMFu04.js";import"async_hooks";import"./zod-B-vvil1C.js";import"node:url";import"./mysql2-HVwznT_d.js";import"net";import"events";import"process";import"timers";import"tls";import"zlib";import"node:process";import"./better-auth-B2r-Xofv.js";import"./kysely-9kO2vj_T.js";import"node:crypto";import"./noble-DY0vnRA-.js";import"node:fs/promises";import"node:os";import"./multer-3TLq-S4Z.js";import"fs/promises";import"./jszip-BZ8kuIwR.js";import"node:util";import"http";import"https";import"assert";const A=a(import.meta.url);async function _i(L,E){const i=[];async function r(t,N){try{await m.execute(_.raw(N)),i.push(`✅ ${t}`)}catch(o){const T=String(o);T.includes("Duplicate")||T.includes("already exists")||T.includes("Multiple primary key")?i.push(`⚠️  ${t}: already exists`):i.push(`❌ ${t}: ${T.slice(0,200)}`)}}await r("Create library_items",`
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
  `),await r("Create company_library_items",`
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
  `),await r("Create library_feedback",`
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
  `),await r("Add FULLTEXT index on library_items (title, summary, tags)",`
    ALTER TABLE library_items
      ADD FULLTEXT INDEX ft_lib_search (title, summary, tags)
  `);const e=i.every(t=>!t.startsWith("❌"));E.json({ok:e,results:i})}export{_i as default};
