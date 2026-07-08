import{createRequire as A}from"module";import{d as N}from"../server.bundle.mjs";import{s as E}from"./drizzle-Bu3hp1FF.js";import"./express-WU0_rYSr.js";import"tty";import"os";import"util";import"path";import"./iconv-DatUeE_T.js";import"buffer";import"string_decoder";import"node:zlib";import"./es-abstract-B57Whf45.js";import"url";import"node:fs";import"node:path";import"fs";import"crypto";import"node:http";import"node:buffer";import"node:querystring";import"node:net";import"stream";import"node:events";import"./radix-ui-CM1-jrUu.js";import"./react-router-8V4KISLV.js";import"./react-dom-D6zqUVF0.js";import"async_hooks";import"./zod-B-vvil1C.js";import"node:url";import"./mysql2-BJ7xsy_S.js";import"net";import"events";import"process";import"timers";import"tls";import"zlib";import"node:process";import"./better-auth-DxltITEC.js";import"./kysely-9kO2vj_T.js";import"node:crypto";import"./noble-DY0vnRA-.js";import"node:fs/promises";import"node:os";import"./multer-DNTYjcWN.js";import"fs/promises";import"http";import"https";import"assert";const m=A(import.meta.url);async function At(_,T){const r=[];async function t(e,L){try{await N.execute(E.raw(L)),r.push(`✓ ${e}`)}catch(o){const i=String(o);i.includes("Duplicate column")||i.includes("already exists")||i.includes("ER_DUP_FIELDNAME")||i.includes("ER_TABLE_EXISTS_ERROR")?r.push(`— ${e} (already exists)`):r.push(`✗ ${e}: ${i}`)}}await t("Create password_reset_tokens table",`
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
  `),await t("Create sms_verification_codes table",`
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
  `),await t("Create trusted_devices table",`
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
  `),await t("Create manual_verification_log table",`
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
  `),await t("Add phone_number to user",`
    ALTER TABLE user ADD COLUMN phone_number VARCHAR(30) NULL
  `),await t("Add verification_method to user",`
    ALTER TABLE user ADD COLUMN verification_method VARCHAR(30) NULL
  `),T.json({ok:!0,results:r})}export{At as default};
