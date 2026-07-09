import{createRequire as e}from"module";import{d as o}from"../server.bundle.mjs";import{s as r}from"./drizzle-CZ2vWAZ3.js";import"./express-C3pMhyZZ.js";import"tty";import"os";import"util";import"path";import"./iconv-DatUeE_T.js";import"buffer";import"string_decoder";import"node:zlib";import"./es-abstract-B57Whf45.js";import"url";import"node:fs";import"node:path";import"fs";import"crypto";import"node:http";import"node:buffer";import"node:querystring";import"node:net";import"stream";import"node:events";import"./radix-ui-Cfam1uum.js";import"./react-router-5dh9OgMp.js";import"./react-dom-CZsMFu04.js";import"async_hooks";import"./zod-B-vvil1C.js";import"node:url";import"./mysql2-HVwznT_d.js";import"net";import"events";import"process";import"timers";import"tls";import"zlib";import"node:process";import"./better-auth-B2r-Xofv.js";import"./kysely-9kO2vj_T.js";import"node:crypto";import"./noble-DY0vnRA-.js";import"node:fs/promises";import"node:os";import"./multer-3TLq-S4Z.js";import"fs/promises";import"./jszip-BZ8kuIwR.js";import"node:util";import"http";import"https";import"assert";const n=e(import.meta.url);async function st(s,m){var p;const t=[];try{await o.execute(r`
      CREATE TABLE IF NOT EXISTS support_audit_events (
        id INT PRIMARY KEY AUTO_INCREMENT,
        owner_user_id VARCHAR(36) NOT NULL,
        target_company_id INT NOT NULL,
        action_type VARCHAR(100) NOT NULL,
        entity_type VARCHAR(100),
        entity_id VARCHAR(100),
        summary TEXT,
        metadata_json TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `),t.push("support_audit_events table ready")}catch(i){t.push(`support_audit_events: ${String(i)}`)}try{const[i]=await o.execute(r`
      SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'companies'
        AND COLUMN_NAME = 'setup_checklist_json'
    `);(((p=i[0])==null?void 0:p.cnt)??0)===0?(await o.execute(r`ALTER TABLE companies ADD COLUMN setup_checklist_json TEXT`),t.push("Added setup_checklist_json to companies")):t.push("setup_checklist_json already exists")}catch(i){t.push(`setup_checklist_json: ${String(i)}`)}m.json({ok:!0,results:t})}export{st as default};
