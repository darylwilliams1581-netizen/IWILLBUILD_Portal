import{createRequire as o}from"module";import{d as r}from"../server.bundle.mjs";import{s as T}from"./drizzle-CZ2vWAZ3.js";import"./express-C3pMhyZZ.js";import"tty";import"os";import"util";import"path";import"./iconv-DatUeE_T.js";import"buffer";import"string_decoder";import"node:zlib";import"./es-abstract-B57Whf45.js";import"url";import"node:fs";import"node:path";import"fs";import"crypto";import"node:http";import"node:buffer";import"node:querystring";import"node:net";import"stream";import"node:events";import"./radix-ui-DB7-u4XC.js";import"./react-router-5dh9OgMp.js";import"./react-dom-CZsMFu04.js";import"async_hooks";import"node:url";import"./mysql2-HVwznT_d.js";import"net";import"events";import"process";import"timers";import"tls";import"zlib";import"node:process";import"./better-auth-B2r-Xofv.js";import"./kysely-9kO2vj_T.js";import"node:crypto";import"./noble-DY0vnRA-.js";import"node:fs/promises";import"node:os";import"./multer-RX-gfMuA.js";import"fs/promises";import"./jszip-BoIs7TcQ.js";import"node:util";import"http";import"https";import"assert";const p=o(import.meta.url);async function Et(m,E){const t=[];try{await r.execute(T`
      CREATE TABLE IF NOT EXISTS estimates (
        id INT PRIMARY KEY AUTO_INCREMENT,
        job_id INT NOT NULL,
        company_id INT NOT NULL,
        title VARCHAR(255) NOT NULL,
        status VARCHAR(60) NOT NULL DEFAULT 'Draft',
        markup_percent VARCHAR(20) NOT NULL DEFAULT '0',
        gst_mode VARCHAR(30) NOT NULL DEFAULT 'No GST',
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
      )
    `),t.push("estimates: table ready")}catch(i){t.push(`estimates error: ${String(i)}`)}try{await r.execute(T`
      CREATE TABLE IF NOT EXISTS estimate_lines (
        id INT PRIMARY KEY AUTO_INCREMENT,
        estimate_id INT NOT NULL,
        description TEXT NOT NULL,
        quantity VARCHAR(30) NOT NULL DEFAULT '1',
        unit VARCHAR(50),
        rate VARCHAR(30) NOT NULL DEFAULT '0',
        line_order INT NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (estimate_id) REFERENCES estimates(id) ON DELETE CASCADE
      )
    `),t.push("estimate_lines: table ready")}catch(i){t.push(`estimate_lines error: ${String(i)}`)}E.json({ok:!0,results:t})}export{Et as default};
