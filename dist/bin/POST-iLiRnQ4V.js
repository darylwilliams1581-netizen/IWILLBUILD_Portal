import{createRequire as T}from"module";import{d as m}from"../server.bundle.mjs";import{s as a}from"./drizzle-Bu3hp1FF.js";import"./express-WU0_rYSr.js";import"tty";import"os";import"util";import"path";import"./iconv-DatUeE_T.js";import"buffer";import"string_decoder";import"node:zlib";import"./es-abstract-B57Whf45.js";import"url";import"node:fs";import"node:path";import"fs";import"crypto";import"node:http";import"node:buffer";import"node:querystring";import"node:net";import"stream";import"node:events";import"./mysql2-BJ7xsy_S.js";import"net";import"events";import"process";import"timers";import"tls";import"zlib";import"node:process";import"./better-auth-CQVzbiZe.js";import"./kysely-9kO2vj_T.js";import"node:crypto";import"./noble-DY0vnRA-.js";import"./opentelemetry-MOfsRXlr.js";import"node:fs/promises";import"node:os";import"fs/promises";import"./multer-aeOynLMg.js";import"http";import"https";import"assert";const n=T(import.meta.url);async function e(r,i,t,o){var s;try{const[p]=await m.execute(a`
      SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ${r}
        AND COLUMN_NAME = ${i}
    `);(((s=p[0])==null?void 0:s.cnt)??0)===0?(await m.execute(a.raw(`ALTER TABLE \`${r}\` ADD COLUMN \`${i}\` ${t}`)),o.push(`Added ${i} to ${r}`)):o.push(`${i} already exists on ${r}`)}catch(p){o.push(`${r}.${i}: ${String(p)}`)}}async function rt(r,i){const t=[];await e("profiles","notification_prefs","TEXT",t),await e("profiles","last_login_at","TIMESTAMP NULL",t),await e("profiles","last_active_at","TIMESTAMP NULL",t);try{await m.execute(a`
      CREATE TABLE IF NOT EXISTS user_activity_events (
        id INT PRIMARY KEY AUTO_INCREMENT,
        company_id INT NOT NULL,
        user_id VARCHAR(36) NOT NULL,
        event_type VARCHAR(50) NOT NULL,
        metadata_json TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `),t.push("user_activity_events table ready")}catch(o){t.push(`user_activity_events: ${String(o)}`)}i.json({ok:!0,results:t})}export{rt as default};
