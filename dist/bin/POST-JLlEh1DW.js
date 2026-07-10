import{createRequire as i}from"module";import{d as m}from"../server.bundle.mjs";import{s as p}from"./drizzle-CZ2vWAZ3.js";import"./express-C3pMhyZZ.js";import"tty";import"os";import"util";import"path";import"./iconv-DatUeE_T.js";import"buffer";import"string_decoder";import"node:zlib";import"./es-abstract-B57Whf45.js";import"url";import"node:fs";import"node:path";import"fs";import"crypto";import"node:http";import"node:buffer";import"node:querystring";import"node:net";import"stream";import"node:events";import"./radix-ui-Cfam1uum.js";import"./react-router-5dh9OgMp.js";import"./react-dom-CZsMFu04.js";import"async_hooks";import"./zod-B-vvil1C.js";import"node:url";import"./mysql2-HVwznT_d.js";import"net";import"events";import"process";import"timers";import"tls";import"zlib";import"node:process";import"./better-auth-B2r-Xofv.js";import"./kysely-9kO2vj_T.js";import"node:crypto";import"./noble-DY0vnRA-.js";import"node:fs/promises";import"node:os";import"./multer-CH1RChRJ.js";import"fs/promises";import"./jszip-DFkTEOyz.js";import"node:util";import"http";import"https";import"assert";const e=i(import.meta.url);async function pt(E,r){const t=[];try{await m.execute(p`
      CREATE TABLE IF NOT EXISTS form_templates (
        id INT PRIMARY KEY AUTO_INCREMENT,
        company_id INT NOT NULL,
        name VARCHAR(255) NOT NULL,
        form_type VARCHAR(50) NOT NULL DEFAULT 'Job',
        category VARCHAR(100),
        description TEXT,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        on_dashboard BOOLEAN NOT NULL DEFAULT FALSE,
        on_jobs BOOLEAN NOT NULL DEFAULT FALSE,
        on_fleet BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
      )
    `),t.push("form_templates table created (or already exists)")}catch(o){t.push(`form_templates: ${String(o)}`)}r.json({ok:!0,results:t})}export{pt as default};
