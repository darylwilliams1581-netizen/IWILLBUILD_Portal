import{createRequire as e}from"module";import{d as i}from"../server.bundle.mjs";import{s as p}from"./drizzle-CZ2vWAZ3.js";import"./express-C3pMhyZZ.js";import"tty";import"os";import"util";import"path";import"./iconv-DatUeE_T.js";import"buffer";import"string_decoder";import"node:zlib";import"./es-abstract-B57Whf45.js";import"url";import"node:fs";import"node:path";import"fs";import"crypto";import"node:http";import"node:buffer";import"node:querystring";import"node:net";import"stream";import"node:events";import"./mysql2-HVwznT_d.js";import"net";import"events";import"process";import"timers";import"tls";import"zlib";import"node:process";import"./better-auth-B2r-Xofv.js";import"./kysely-9kO2vj_T.js";import"node:crypto";import"./noble-DY0vnRA-.js";import"node:fs/promises";import"node:os";import"./multer-RX-gfMuA.js";import"fs/promises";import"./jszip-BoIs7TcQ.js";import"node:util";import"http";import"https";import"assert";const c=e(import.meta.url);async function tt(a,m){const t=[];try{await i.execute(p`
      ALTER TABLE companies
        ADD COLUMN IF NOT EXISTS starter_pack_loaded TINYINT(1) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS starter_pack_loaded_at TIMESTAMP NULL
    `),t.push("companies.starter_pack_loaded: ok")}catch(r){const o=String(r);o.includes("Duplicate column")||o.includes("already exists")?t.push("companies.starter_pack_loaded: already exists"):t.push(`companies.starter_pack_loaded ERROR: ${o}`)}try{await i.execute(p`
      CREATE TABLE IF NOT EXISTS starter_pack_runs (
        id INT PRIMARY KEY AUTO_INCREMENT,
        company_id INT NOT NULL,
        run_by_user_id VARCHAR(36) NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'pending',
        notes TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
      )
    `),t.push("starter_pack_runs: ok")}catch(r){t.push(`starter_pack_runs ERROR: ${String(r)}`)}m.json({ok:!0,results:t})}export{tt as default};
