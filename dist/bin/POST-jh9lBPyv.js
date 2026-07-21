import{createRequire as m}from"module";import{v as p,d as a}from"../server.bundle.mjs";import{s as L}from"./drizzle-CZ2vWAZ3.js";import"./express-C3pMhyZZ.js";import"tty";import"os";import"util";import"path";import"./iconv-DatUeE_T.js";import"buffer";import"string_decoder";import"node:zlib";import"./es-abstract-B57Whf45.js";import"url";import"node:fs";import"node:path";import"fs";import"crypto";import"node:http";import"node:buffer";import"node:querystring";import"node:net";import"stream";import"node:events";import"./radix-ui-DB7-u4XC.js";import"./react-router-5dh9OgMp.js";import"./react-dom-CZsMFu04.js";import"async_hooks";import"node:url";import"./mysql2-HVwznT_d.js";import"net";import"events";import"process";import"timers";import"tls";import"zlib";import"node:process";import"./better-auth-B2r-Xofv.js";import"./kysely-9kO2vj_T.js";import"node:crypto";import"./noble-DY0vnRA-.js";import"node:fs/promises";import"node:os";import"./multer-RX-gfMuA.js";import"fs/promises";import"./jszip-BoIs7TcQ.js";import"node:util";import"http";import"https";import"assert";import"./pdf-lib-MF9mTnF3.js";const n=m(import.meta.url);async function ar(e,r){const o=await p(e,r);if(o){if(o.profile.role!=="owner"&&o.profile.role!=="admin")return r.status(403).json({error:"Admin access required"});try{return await a.execute(L.raw(`
      CREATE TABLE IF NOT EXISTS emergency_alerts (
        id                  INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
        company_id          INT           NOT NULL,
        job_id              INT           NOT NULL,
        initiated_by        VARCHAR(255)  NOT NULL,
        initiated_by_name   VARCHAR(255)  NOT NULL,
        reason              VARCHAR(100)  NOT NULL,
        note                VARCHAR(100)  NULL,
        status              VARCHAR(30)   NOT NULL DEFAULT 'active',
        lat                 DECIMAL(10,7) NULL,
        lng                 DECIMAL(10,7) NULL,
        location_accuracy_m DECIMAL(7,2)  NULL,
        location_denied     TINYINT(1)    NOT NULL DEFAULT 0,
        acknowledged_by     VARCHAR(255)  NULL,
        acknowledged_by_name VARCHAR(255) NULL,
        acknowledged_at     TIMESTAMP     NULL,
        resolved_by         VARCHAR(255)  NULL,
        resolved_by_name    VARCHAR(255)  NULL,
        resolved_at         TIMESTAMP     NULL,
        offline_queued      TINYINT(1)    NOT NULL DEFAULT 0,
        created_at          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_ea_company_job  (company_id, job_id),
        INDEX idx_ea_status       (status),
        INDEX idx_ea_initiated_by (initiated_by)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)),r.json({ok:!0})}catch(t){const i=t instanceof Error?t.message:String(t);return i.includes("already exists")?r.json({ok:!0,skipped:!0}):(console.error("migrate-emergency-alerts error:",t),r.status(500).json({error:i}))}}}export{ar as default};
