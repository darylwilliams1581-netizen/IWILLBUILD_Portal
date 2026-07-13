import{createRequire as o}from"module";import{d as i}from"../server.bundle.mjs";import{s as m}from"./drizzle-CZ2vWAZ3.js";import"./express-C3pMhyZZ.js";import"tty";import"os";import"util";import"path";import"./iconv-DatUeE_T.js";import"buffer";import"string_decoder";import"node:zlib";import"./es-abstract-B57Whf45.js";import"url";import"node:fs";import"node:path";import"fs";import"crypto";import"node:http";import"node:buffer";import"node:querystring";import"node:net";import"stream";import"node:events";import"./radix-ui-C6rnOgg1.js";import"./react-router-CkzSIMgX.js";import"./react-dom-CZsMFu04.js";import"async_hooks";import"node:url";import"./mysql2-HVwznT_d.js";import"net";import"events";import"process";import"timers";import"tls";import"zlib";import"node:process";import"./better-auth-B2r-Xofv.js";import"./kysely-9kO2vj_T.js";import"node:crypto";import"./noble-DY0vnRA-.js";import"node:fs/promises";import"node:os";import"./multer-CH1RChRJ.js";import"fs/promises";import"./jszip-DFkTEOyz.js";import"node:util";import"http";import"https";import"assert";const a=o(import.meta.url);async function it(p,t){try{await i.execute(m`
      CREATE TABLE IF NOT EXISTS estimating_takeoff_pads (
        id INT PRIMARY KEY AUTO_INCREMENT,
        company_id INT NOT NULL,
        user_id VARCHAR(36) NOT NULL,
        title VARCHAR(255) NOT NULL DEFAULT '',
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_takeoff_company_user (company_id, user_id)
      )
    `),t.json({ok:!0,message:"estimating_takeoff_pads table ready"})}catch(r){console.error("migrate-takeoff-pad error:",r),t.status(500).json({error:String(r)})}}export{it as default};
