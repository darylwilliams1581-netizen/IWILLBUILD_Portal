import{createRequire as N}from"module";import{v as m,d as L}from"../server.bundle.mjs";import{s as n}from"./drizzle-CZ2vWAZ3.js";import"./express-C3pMhyZZ.js";import"tty";import"os";import"util";import"path";import"./iconv-DatUeE_T.js";import"buffer";import"string_decoder";import"node:zlib";import"./es-abstract-B57Whf45.js";import"url";import"node:fs";import"node:path";import"fs";import"crypto";import"node:http";import"node:buffer";import"node:querystring";import"node:net";import"stream";import"node:events";import"./radix-ui-Cfam1uum.js";import"./react-router-5dh9OgMp.js";import"./react-dom-CZsMFu04.js";import"async_hooks";import"./zod-B-vvil1C.js";import"node:url";import"./mysql2-HVwznT_d.js";import"net";import"events";import"process";import"timers";import"tls";import"zlib";import"node:process";import"./better-auth-B2r-Xofv.js";import"./kysely-9kO2vj_T.js";import"node:crypto";import"./noble-DY0vnRA-.js";import"node:fs/promises";import"node:os";import"./multer-CH1RChRJ.js";import"fs/promises";import"./jszip-DFkTEOyz.js";import"node:util";import"http";import"https";import"assert";const _=N(import.meta.url);async function t(o,r){try{return await L.execute(n.raw(r)),{label:o,ok:!0}}catch(e){const i=e instanceof Error?e.message:String(e);return i.includes("Duplicate column")||i.includes("already exists")?{label:o,ok:!0,skipped:!0}:{label:o,ok:!1,error:i}}}async function Lt(o,r){const e=await m(o,r);if(!e)return;if(e.profile.role!=="owner"&&e.profile.role!=="admin")return r.status(403).json({error:"Admin access required"});const i=await Promise.all([t("fds.total_distance_km","ALTER TABLE fleet_driver_sessions ADD COLUMN IF NOT EXISTS total_distance_km DECIMAL(10,3) NULL"),t("fds.active_drive_seconds","ALTER TABLE fleet_driver_sessions ADD COLUMN IF NOT EXISTS active_drive_seconds INT NULL"),t("fds.avg_speed_kmh","ALTER TABLE fleet_driver_sessions ADD COLUMN IF NOT EXISTS avg_speed_kmh DECIMAL(6,2) NULL"),t("fds.max_speed_kmh","ALTER TABLE fleet_driver_sessions ADD COLUMN IF NOT EXISTS max_speed_kmh DECIMAL(6,2) NULL"),t("fds.collision_count","ALTER TABLE fleet_driver_sessions ADD COLUMN IF NOT EXISTS collision_count INT NOT NULL DEFAULT 0"),t("fds.summary_computed_at","ALTER TABLE fleet_driver_sessions ADD COLUMN IF NOT EXISTS summary_computed_at TIMESTAMP NULL"),t("create fleet_session_telemetry",`
      CREATE TABLE IF NOT EXISTS fleet_session_telemetry (
        id            BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
        company_id    INT          NOT NULL,
        session_id    INT          NOT NULL,
        recorded_at   DATETIME(3)  NOT NULL,
        lat           DECIMAL(10,7) NOT NULL,
        lng           DECIMAL(10,7) NOT NULL,
        speed_kmh     DECIMAL(6,2)  NULL,
        heading       DECIMAL(5,2)  NULL,
        accuracy_m    DECIMAL(7,2)  NULL,
        is_collision  TINYINT(1)   NOT NULL DEFAULT 0,
        INDEX idx_fst_session (session_id),
        INDEX idx_fst_company_session (company_id, session_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `),t("create fleet_analytics_settings",`
      CREATE TABLE IF NOT EXISTS fleet_analytics_settings (
        id                      INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
        company_id              INT          NOT NULL UNIQUE,
        track_distance          TINYINT(1)   NOT NULL DEFAULT 1,
        track_drive_time        TINYINT(1)   NOT NULL DEFAULT 1,
        track_speed             TINYINT(1)   NOT NULL DEFAULT 1,
        enable_speeding_alerts  TINYINT(1)   NOT NULL DEFAULT 0,
        speeding_threshold_kmh  INT          NOT NULL DEFAULT 110,
        enable_collision_alerts TINYINT(1)   NOT NULL DEFAULT 0,
        updated_at              TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_fas_company (company_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)]),s=i.filter(T=>!T.ok);return s.length?r.status(500).json({ok:!1,results:i,failed:s}):r.json({ok:!0,results:i})}export{Lt as default};
