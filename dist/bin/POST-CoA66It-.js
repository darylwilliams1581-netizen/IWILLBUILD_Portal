import{createRequire as t}from"module";import{d as i}from"../server.bundle.mjs";import{s as p}from"./drizzle-CZ2vWAZ3.js";import"./express-C3pMhyZZ.js";import"tty";import"os";import"util";import"path";import"./iconv-DatUeE_T.js";import"buffer";import"string_decoder";import"node:zlib";import"./es-abstract-B57Whf45.js";import"url";import"node:fs";import"node:path";import"fs";import"crypto";import"node:http";import"node:buffer";import"node:querystring";import"node:net";import"stream";import"node:events";import"./mysql2-HVwznT_d.js";import"net";import"events";import"process";import"timers";import"tls";import"zlib";import"node:process";import"./better-auth-B2r-Xofv.js";import"./kysely-9kO2vj_T.js";import"node:crypto";import"./noble-DY0vnRA-.js";import"node:fs/promises";import"node:os";import"./multer-RX-gfMuA.js";import"fs/promises";import"./jszip-BoIs7TcQ.js";import"node:util";import"http";import"https";import"assert";import"./pdf-lib-MF9mTnF3.js";const a=t(import.meta.url);async function $(m,o){try{await i.execute(p`
      CREATE TABLE IF NOT EXISTS job_photo_shares (
        id                  INT AUTO_INCREMENT PRIMARY KEY,
        job_id              INT NOT NULL,
        company_id          INT NOT NULL,
        token_hash          VARCHAR(64) NOT NULL,
        expires_at          DATETIME NULL,
        created_by_user_id  VARCHAR(36) NULL,
        created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_job_photo_shares_token (token_hash),
        UNIQUE KEY uq_job_photo_shares_job (job_id),
        INDEX idx_jps_company (company_id)
      )
    `),o.json({ok:!0,message:"job_photo_shares table ready"})}catch(r){console.error("migrate-job-photo-shares error:",r),o.status(500).json({error:String(r)})}}export{$ as default};
