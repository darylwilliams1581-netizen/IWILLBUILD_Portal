import{createRequire as o}from"module";import{d as m}from"../server.bundle.mjs";import{s as p}from"./drizzle-CZ2vWAZ3.js";import"./express-C3pMhyZZ.js";import"tty";import"os";import"util";import"path";import"./iconv-DatUeE_T.js";import"buffer";import"string_decoder";import"node:zlib";import"./es-abstract-B57Whf45.js";import"url";import"node:fs";import"node:path";import"fs";import"crypto";import"node:http";import"node:buffer";import"node:querystring";import"node:net";import"stream";import"node:events";import"./radix-ui-Cfam1uum.js";import"./react-router-5dh9OgMp.js";import"./react-dom-CZsMFu04.js";import"async_hooks";import"./zod-B-vvil1C.js";import"node:url";import"./mysql2-HVwznT_d.js";import"net";import"events";import"process";import"timers";import"tls";import"zlib";import"node:process";import"./better-auth-B2r-Xofv.js";import"./kysely-9kO2vj_T.js";import"node:crypto";import"./noble-DY0vnRA-.js";import"node:fs/promises";import"node:os";import"./multer-3TLq-S4Z.js";import"fs/promises";import"http";import"https";import"assert";const T=o(import.meta.url);async function ot(E,r){const t=[];try{await m.execute(p`
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
