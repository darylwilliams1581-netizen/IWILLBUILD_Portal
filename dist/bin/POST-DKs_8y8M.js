import{createRequire as i}from"module";import{d as m}from"../server.bundle.mjs";import{s as p}from"./drizzle-CZ2vWAZ3.js";import"./express-C3pMhyZZ.js";import"tty";import"os";import"util";import"path";import"./iconv-DatUeE_T.js";import"buffer";import"string_decoder";import"node:zlib";import"./es-abstract-B57Whf45.js";import"url";import"node:fs";import"node:path";import"fs";import"crypto";import"node:http";import"node:buffer";import"node:querystring";import"node:net";import"stream";import"node:events";import"./mysql2-HVwznT_d.js";import"net";import"events";import"process";import"timers";import"tls";import"zlib";import"node:process";import"./better-auth-B2r-Xofv.js";import"./kysely-9kO2vj_T.js";import"node:crypto";import"./noble-DY0vnRA-.js";import"node:fs/promises";import"node:os";import"./multer-RX-gfMuA.js";import"fs/promises";import"./jszip-BoIs7TcQ.js";import"node:util";import"http";import"https";import"assert";import"./pdf-lib-MF9mTnF3.js";const a=i(import.meta.url);async function tt(e,r){try{await m.execute(p`
      CREATE TABLE IF NOT EXISTS dazza_knowledge (
        id            INT AUTO_INCREMENT PRIMARY KEY,
        company_id    INT NOT NULL,
        title         VARCHAR(255) NOT NULL,
        category      VARCHAR(100) NOT NULL DEFAULT 'Company procedure',
        content       LONGTEXT NOT NULL,
        source_name   VARCHAR(255) DEFAULT NULL,
        active        TINYINT(1) NOT NULL DEFAULT 1,
        created_by    VARCHAR(255) NOT NULL DEFAULT '',
        created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_dk_company (company_id),
        INDEX idx_dk_active  (company_id, active)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `),r.json({ok:!0,message:"dazza_knowledge table ready"})}catch(t){const o=String((t==null?void 0:t.message)??t);console.error("migrate-dazza-knowledge error:",o),r.status(500).json({error:o})}}export{tt as default};
