import{createRequire as o}from"module";import{d as m}from"../server.bundle.mjs";import{s as p}from"./drizzle-Bu3hp1FF.js";import"./express-WU0_rYSr.js";import"tty";import"os";import"util";import"path";import"./iconv-DatUeE_T.js";import"buffer";import"string_decoder";import"node:zlib";import"./es-abstract-B57Whf45.js";import"url";import"node:fs";import"node:path";import"fs";import"crypto";import"node:http";import"node:buffer";import"node:querystring";import"node:net";import"stream";import"node:events";import"./radix-ui-CM1-jrUu.js";import"./react-router-8V4KISLV.js";import"./react-dom-D6zqUVF0.js";import"async_hooks";import"./zod-B-vvil1C.js";import"node:url";import"./mysql2-BJ7xsy_S.js";import"net";import"events";import"process";import"timers";import"tls";import"zlib";import"node:process";import"./better-auth-DxltITEC.js";import"./kysely-9kO2vj_T.js";import"node:crypto";import"./noble-DY0vnRA-.js";import"node:fs/promises";import"node:os";import"./multer-DNTYjcWN.js";import"fs/promises";import"http";import"https";import"assert";const T=o(import.meta.url);async function ot(E,r){const t=[];try{await m.execute(p`
      CREATE TABLE IF NOT EXISTS fleet_driver_sessions (
        id INT PRIMARY KEY AUTO_INCREMENT,
        company_id INT NOT NULL,
        fleet_asset_id INT NOT NULL,
        user_id VARCHAR(36) NOT NULL,
        driver_name VARCHAR(255) NOT NULL,
        start_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        end_at TIMESTAMP NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        source VARCHAR(50) NOT NULL DEFAULT 'dashboard_quick_start',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
        FOREIGN KEY (fleet_asset_id) REFERENCES fleet_assets(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
      )
    `),t.push("fleet_driver_sessions: table ready")}catch(i){t.push(`fleet_driver_sessions error: ${String(i)}`)}r.json({ok:!0,results:t})}export{ot as default};
