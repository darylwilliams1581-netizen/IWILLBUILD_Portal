import{createRequire as N}from"module";import{m as L,d as m}from"../server.bundle.mjs";import{s as n}from"./drizzle-Bu3hp1FF.js";import"./express-WU0_rYSr.js";import"tty";import"os";import"util";import"path";import"./iconv-DatUeE_T.js";import"buffer";import"string_decoder";import"node:zlib";import"./es-abstract-B57Whf45.js";import"url";import"node:fs";import"node:path";import"fs";import"crypto";import"node:http";import"node:buffer";import"node:querystring";import"node:net";import"stream";import"node:events";import"./mysql2-BJ7xsy_S.js";import"net";import"events";import"process";import"timers";import"tls";import"zlib";import"node:process";import"./better-auth-CQVzbiZe.js";import"./kysely-9kO2vj_T.js";import"node:crypto";import"./noble-DY0vnRA-.js";import"./opentelemetry-MOfsRXlr.js";import"node:fs/promises";import"node:os";import"./multer-DNTYjcWN.js";import"fs/promises";import"http";import"https";import"assert";const a=N(import.meta.url);async function e(s,r){try{return await m.execute(n.raw(r)),{label:s,ok:!0}}catch(t){const i=t instanceof Error?t.message:String(t);return i.includes("Duplicate column")||i.includes("already exists")?{label:s,ok:!0,skipped:!0}:{label:s,ok:!1,error:i}}}async function ie(s,r){const t=await L(s,r);if(!t)return;if(t.profile.role!=="owner"&&t.profile.role!=="admin")return r.status(403).json({error:"Admin access required"});const i=await Promise.all([e("fds.total_distance_km","ALTER TABLE fleet_driver_sessions ADD COLUMN IF NOT EXISTS total_distance_km DECIMAL(10,3) NULL"),e("fds.active_drive_seconds","ALTER TABLE fleet_driver_sessions ADD COLUMN IF NOT EXISTS active_drive_seconds INT NULL"),e("fds.avg_speed_kmh","ALTER TABLE fleet_driver_sessions ADD COLUMN IF NOT EXISTS avg_speed_kmh DECIMAL(6,2) NULL"),e("fds.max_speed_kmh","ALTER TABLE fleet_driver_sessions ADD COLUMN IF NOT EXISTS max_speed_kmh DECIMAL(6,2) NULL"),e("fds.collision_count","ALTER TABLE fleet_driver_sessions ADD COLUMN IF NOT EXISTS collision_count INT NOT NULL DEFAULT 0"),e("fds.summary_computed_at","ALTER TABLE fleet_driver_sessions ADD COLUMN IF NOT EXISTS summary_computed_at TIMESTAMP NULL"),e("create fleet_session_telemetry",`
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
    `),e("create fleet_analytics_settings",`
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
    `)]),o=i.filter(T=>!T.ok);return o.length?r.status(500).json({ok:!1,results:i,failed:o}):r.json({ok:!0,results:i})}export{ie as default};
