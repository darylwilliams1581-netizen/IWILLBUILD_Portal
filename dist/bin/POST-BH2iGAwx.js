import{createRequire as p}from"module";import{d as a}from"../server.bundle.mjs";import{s as A}from"./drizzle-CZ2vWAZ3.js";import"./express-C3pMhyZZ.js";import"tty";import"os";import"util";import"path";import"./iconv-DatUeE_T.js";import"buffer";import"string_decoder";import"node:zlib";import"./es-abstract-B57Whf45.js";import"url";import"node:fs";import"node:path";import"fs";import"crypto";import"node:http";import"node:buffer";import"node:querystring";import"node:net";import"stream";import"node:events";import"./radix-ui-C6rnOgg1.js";import"./react-router-CkzSIMgX.js";import"./react-dom-CZsMFu04.js";import"async_hooks";import"node:url";import"./mysql2-HVwznT_d.js";import"net";import"events";import"process";import"timers";import"tls";import"zlib";import"node:process";import"./better-auth-B2r-Xofv.js";import"./kysely-9kO2vj_T.js";import"node:crypto";import"./noble-DY0vnRA-.js";import"node:fs/promises";import"node:os";import"./multer-CH1RChRJ.js";import"fs/promises";import"./jszip-DFkTEOyz.js";import"node:util";import"http";import"https";import"assert";const L=p(import.meta.url);async function ai(_,r){const i=[];async function E(t,e){try{await a.execute(A.raw(e)),i.push(`✅ ${t}`)}catch(T){const o=String(T);o.includes("Duplicate")||o.includes("already exists")||o.includes("Multiple primary key")?i.push(`⚠️  ${t}: already exists`):i.push(`❌ ${t}: ${o.slice(0,300)}`)}}await E("Create job_attendance",`
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
  `),await E("Create guest_checkins",`
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
  `),await E("Create qr_tokens",`
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
  `);const N=i.every(t=>!t.startsWith("❌"));r.json({ok:N,results:i})}export{ai as default};
