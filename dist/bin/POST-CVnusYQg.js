import{createRequire as E}from"module";import{d as e}from"../server.bundle.mjs";import{s as N}from"./drizzle-Bu3hp1FF.js";import"./express-WU0_rYSr.js";import"tty";import"os";import"util";import"path";import"./iconv-DatUeE_T.js";import"buffer";import"string_decoder";import"node:zlib";import"./es-abstract-B57Whf45.js";import"url";import"node:fs";import"node:path";import"fs";import"crypto";import"node:http";import"node:buffer";import"node:querystring";import"node:net";import"stream";import"node:events";import"./radix-ui-CM1-jrUu.js";import"./react-router-8V4KISLV.js";import"./react-dom-D6zqUVF0.js";import"async_hooks";import"./zod-B-vvil1C.js";import"node:url";import"./mysql2-BJ7xsy_S.js";import"net";import"events";import"process";import"timers";import"tls";import"zlib";import"node:process";import"./better-auth-DxltITEC.js";import"./kysely-9kO2vj_T.js";import"node:crypto";import"./noble-DY0vnRA-.js";import"node:fs/promises";import"node:os";import"./multer-DNTYjcWN.js";import"fs/promises";import"./jszip-Yfw9Muqe.js";import"http";import"https";import"assert";const a=E(import.meta.url);async function et(T,r){const t=[];async function o(i,m){try{await e.execute(N.raw(m)),t.push(`✅ ${i}`)}catch(p){t.push(`⚠️  ${i}: ${String(p)}`)}}await o("Create company_files",`
    CREATE TABLE IF NOT EXISTS company_files (
      id INT PRIMARY KEY AUTO_INCREMENT,
      company_id INT NOT NULL,
      job_id INT NULL,
      fleet_asset_id INT NULL,
      uploaded_by_user_id VARCHAR(36) NOT NULL,
      original_name VARCHAR(255) NOT NULL,
      stored_name VARCHAR(255) NOT NULL,
      mime_type VARCHAR(100) NOT NULL,
      size_bytes INT NOT NULL,
      file_category VARCHAR(50) NOT NULL DEFAULT 'Other',
      label VARCHAR(255) NULL,
      notes TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
      FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE SET NULL,
      FOREIGN KEY (fleet_asset_id) REFERENCES fleet_assets(id) ON DELETE SET NULL,
      FOREIGN KEY (uploaded_by_user_id) REFERENCES user(id) ON DELETE CASCADE
    )
  `),r.json({ok:!0,results:t})}export{et as default};
