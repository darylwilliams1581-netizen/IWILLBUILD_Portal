import{createRequire as o}from"module";import{v as i,d as m}from"../server.bundle.mjs";import{s as p}from"./drizzle-CZ2vWAZ3.js";import"./express-C3pMhyZZ.js";import"tty";import"os";import"util";import"path";import"./iconv-DatUeE_T.js";import"buffer";import"string_decoder";import"node:zlib";import"./es-abstract-B57Whf45.js";import"url";import"node:fs";import"node:path";import"fs";import"crypto";import"node:http";import"node:buffer";import"node:querystring";import"node:net";import"stream";import"node:events";import"./radix-ui-DB7-u4XC.js";import"./react-router-5dh9OgMp.js";import"./react-dom-CZsMFu04.js";import"async_hooks";import"node:url";import"./mysql2-HVwznT_d.js";import"net";import"events";import"process";import"timers";import"tls";import"zlib";import"node:process";import"./better-auth-B2r-Xofv.js";import"./kysely-9kO2vj_T.js";import"node:crypto";import"./noble-DY0vnRA-.js";import"node:fs/promises";import"node:os";import"./multer-RX-gfMuA.js";import"fs/promises";import"./jszip-BoIs7TcQ.js";import"node:util";import"http";import"https";import"assert";import"./pdf-lib-MF9mTnF3.js";const a=o(import.meta.url);async function mt(e,r){try{const t=await i(e,r);if(!t)return;if(t.profile.role!=="owner"&&t.profile.role!=="admin")return r.status(403).json({error:"Owner or admin required"});await m.execute(p`
      CREATE TABLE IF NOT EXISTS fleet_usage_logs (
        id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        company_id      INT UNSIGNED NOT NULL,
        fleet_id        INT UNSIGNED NOT NULL,
        job_id          INT UNSIGNED NULL,
        user_id         VARCHAR(255) NOT NULL,
        actor_type      ENUM('employee','contractor','consultant','delivery_driver','guest')
                        NOT NULL DEFAULT 'employee',
        started_at      DATETIME NOT NULL,
        ended_at        DATETIME NULL,
        duration_minutes INT UNSIGNED NULL,
        source          ENUM('portal','qr') NOT NULL DEFAULT 'portal',
        note            TEXT NULL,
        meter_start     DECIMAL(10,1) NULL,
        meter_end       DECIMAL(10,1) NULL,
        created_by      VARCHAR(255) NOT NULL,
        created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_fleet_usage_company  (company_id),
        INDEX idx_fleet_usage_fleet    (fleet_id),
        INDEX idx_fleet_usage_job      (job_id),
        INDEX idx_fleet_usage_user     (user_id),
        INDEX idx_fleet_usage_started  (started_at),
        INDEX idx_fleet_usage_active   (fleet_id, ended_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `),r.json({ok:!0,message:"fleet_usage_logs table ready"})}catch(t){console.error("POST /api/migrate-fleet-usage error:",t),r.status(500).json({error:String(t)})}}export{mt as default};
