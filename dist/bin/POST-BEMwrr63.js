import{createRequire as i}from"module";import{d as m}from"../server.bundle.mjs";import{s as p}from"./drizzle-Bu3hp1FF.js";import"./express-WU0_rYSr.js";import"tty";import"os";import"util";import"path";import"./iconv-DatUeE_T.js";import"buffer";import"string_decoder";import"node:zlib";import"./es-abstract-B57Whf45.js";import"url";import"node:fs";import"node:path";import"fs";import"crypto";import"node:http";import"node:buffer";import"node:querystring";import"node:net";import"stream";import"node:events";import"./radix-ui-BjnQoRNV.js";import"./react-router-8V4KISLV.js";import"./react-dom-D6zqUVF0.js";import"async_hooks";import"node:url";import"./mysql2-BJ7xsy_S.js";import"net";import"events";import"process";import"timers";import"tls";import"zlib";import"node:process";import"./better-auth-CQVzbiZe.js";import"./kysely-9kO2vj_T.js";import"node:crypto";import"./noble-DY0vnRA-.js";import"./opentelemetry-MOfsRXlr.js";import"node:fs/promises";import"node:os";import"./multer-DNTYjcWN.js";import"fs/promises";import"http";import"https";import"assert";const a=i(import.meta.url);async function it(e,r){try{await m.execute(p`
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
    `),r.json({ok:!0,message:"dazza_knowledge table ready"})}catch(t){const o=String((t==null?void 0:t.message)??t);console.error("migrate-dazza-knowledge error:",o),r.status(500).json({error:o})}}export{it as default};
