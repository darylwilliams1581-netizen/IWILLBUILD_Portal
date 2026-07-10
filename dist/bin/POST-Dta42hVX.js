import{createRequire as T}from"module";import{d as e}from"../server.bundle.mjs";import{s as a}from"./drizzle-CZ2vWAZ3.js";import"./express-C3pMhyZZ.js";import"tty";import"os";import"util";import"path";import"./iconv-DatUeE_T.js";import"buffer";import"string_decoder";import"node:zlib";import"./es-abstract-B57Whf45.js";import"url";import"node:fs";import"node:path";import"fs";import"crypto";import"node:http";import"node:buffer";import"node:querystring";import"node:net";import"stream";import"node:events";import"./radix-ui-Cfam1uum.js";import"./react-router-5dh9OgMp.js";import"./react-dom-CZsMFu04.js";import"async_hooks";import"./zod-B-vvil1C.js";import"node:url";import"./mysql2-HVwznT_d.js";import"net";import"events";import"process";import"timers";import"tls";import"zlib";import"node:process";import"./better-auth-B2r-Xofv.js";import"./kysely-9kO2vj_T.js";import"node:crypto";import"./noble-DY0vnRA-.js";import"node:fs/promises";import"node:os";import"./multer-CH1RChRJ.js";import"fs/promises";import"./jszip-DFkTEOyz.js";import"node:util";import"http";import"https";import"assert";const n=T(import.meta.url);async function m(r,i,t,o){var s;try{const[p]=await e.execute(a`
      SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ${r}
        AND COLUMN_NAME = ${i}
    `);(((s=p[0])==null?void 0:s.cnt)??0)===0?(await e.execute(a.raw(`ALTER TABLE \`${r}\` ADD COLUMN \`${i}\` ${t}`)),o.push(`Added ${i} to ${r}`)):o.push(`${i} already exists on ${r}`)}catch(p){o.push(`${r}.${i}: ${String(p)}`)}}async function Tt(r,i){const t=[];await m("profiles","notification_prefs","TEXT",t),await m("profiles","last_login_at","TIMESTAMP NULL",t),await m("profiles","last_active_at","TIMESTAMP NULL",t);try{await e.execute(a`
      CREATE TABLE IF NOT EXISTS user_activity_events (
        id INT PRIMARY KEY AUTO_INCREMENT,
        company_id INT NOT NULL,
        user_id VARCHAR(36) NOT NULL,
        event_type VARCHAR(50) NOT NULL,
        metadata_json TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `),t.push("user_activity_events table ready")}catch(o){t.push(`user_activity_events: ${String(o)}`)}i.json({ok:!0,results:t})}export{Tt as default};
