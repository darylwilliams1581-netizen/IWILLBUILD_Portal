import{createRequire as a}from"module";import{d as i}from"../server.bundle.mjs";import{s as r}from"./drizzle-Bu3hp1FF.js";import"./express-WU0_rYSr.js";import"tty";import"os";import"util";import"path";import"./iconv-DatUeE_T.js";import"buffer";import"string_decoder";import"node:zlib";import"./es-abstract-B57Whf45.js";import"url";import"node:fs";import"node:path";import"fs";import"crypto";import"node:http";import"node:buffer";import"node:querystring";import"node:net";import"stream";import"node:events";import"./radix-ui-CM1-jrUu.js";import"./react-router-8V4KISLV.js";import"./react-dom-D6zqUVF0.js";import"async_hooks";import"./zod-B-vvil1C.js";import"node:url";import"./mysql2-BJ7xsy_S.js";import"net";import"events";import"process";import"timers";import"tls";import"zlib";import"node:process";import"./better-auth-DxltITEC.js";import"./kysely-9kO2vj_T.js";import"node:crypto";import"./noble-DY0vnRA-.js";import"node:fs/promises";import"node:os";import"./multer-DNTYjcWN.js";import"fs/promises";import"./jszip-Yfw9Muqe.js";import"http";import"https";import"assert";const s=a(import.meta.url);async function Et(A,m){var p,e;const t=[];try{await i.execute(r`
      CREATE TABLE IF NOT EXISTS job_photos (
        id INT PRIMARY KEY AUTO_INCREMENT,
        job_id INT NOT NULL,
        company_id INT NOT NULL,
        filename VARCHAR(255) NOT NULL,
        original_name VARCHAR(255),
        label VARCHAR(255),
        mime_type VARCHAR(100),
        size_bytes INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
      )
    `),t.push("job_photos table: OK")}catch(o){t.push(`job_photos create: ${String(o)}`)}try{const o=await i.execute(r`
      SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'job_photos'
        AND COLUMN_NAME = 'uploaded_by_user_id'
    `);Number(((p=o[0])==null?void 0:p.cnt)??0)===0?(await i.execute(r`ALTER TABLE job_photos ADD COLUMN uploaded_by_user_id VARCHAR(36) NULL`),t.push("added uploaded_by_user_id")):t.push("uploaded_by_user_id: already exists")}catch(o){t.push(`uploaded_by_user_id: ${String(o)}`)}try{const o=await i.execute(r`
      SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'job_photos'
        AND COLUMN_NAME = 'uploaded_by_name'
    `);Number(((e=o[0])==null?void 0:e.cnt)??0)===0?(await i.execute(r`ALTER TABLE job_photos ADD COLUMN uploaded_by_name VARCHAR(255) NULL`),t.push("added uploaded_by_name")):t.push("uploaded_by_name: already exists")}catch(o){t.push(`uploaded_by_name: ${String(o)}`)}m.json({ok:!0,results:t})}export{Et as default};
