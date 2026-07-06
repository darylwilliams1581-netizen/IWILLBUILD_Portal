import{createRequire as m}from"module";import{d as o}from"../server.bundle.mjs";import{s as r}from"./drizzle-Bu3hp1FF.js";import"./express-WU0_rYSr.js";import"tty";import"os";import"util";import"path";import"./iconv-DatUeE_T.js";import"buffer";import"string_decoder";import"node:zlib";import"./es-abstract-B57Whf45.js";import"url";import"node:fs";import"node:path";import"fs";import"crypto";import"node:http";import"node:buffer";import"node:querystring";import"node:net";import"stream";import"node:events";import"./mysql2-BJ7xsy_S.js";import"net";import"events";import"process";import"timers";import"tls";import"zlib";import"node:process";import"./better-auth-CQVzbiZe.js";import"./kysely-9kO2vj_T.js";import"node:crypto";import"./noble-DY0vnRA-.js";import"./opentelemetry-MOfsRXlr.js";import"node:fs/promises";import"node:os";import"fs/promises";import"./multer-aeOynLMg.js";import"http";import"https";import"assert";const n=m(import.meta.url);async function tt(s,e){var p;const t=[];try{await o.execute(r`
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
    `);(((p=i[0])==null?void 0:p.cnt)??0)===0?(await o.execute(r`ALTER TABLE companies ADD COLUMN setup_checklist_json TEXT`),t.push("Added setup_checklist_json to companies")):t.push("setup_checklist_json already exists")}catch(i){t.push(`setup_checklist_json: ${String(i)}`)}e.json({ok:!0,results:t})}export{tt as default};
