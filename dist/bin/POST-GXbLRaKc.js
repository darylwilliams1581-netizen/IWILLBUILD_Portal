import{createRequire as e}from"module";import{d as i}from"../server.bundle.mjs";import{s as m}from"./drizzle-CZ2vWAZ3.js";import"./express-C3pMhyZZ.js";import"tty";import"os";import"util";import"path";import"./iconv-DatUeE_T.js";import"buffer";import"string_decoder";import"node:zlib";import"./es-abstract-B57Whf45.js";import"url";import"node:fs";import"node:path";import"fs";import"crypto";import"node:http";import"node:buffer";import"node:querystring";import"node:net";import"stream";import"node:events";import"./radix-ui-DB7-u4XC.js";import"./react-router-5dh9OgMp.js";import"./react-dom-CZsMFu04.js";import"async_hooks";import"node:url";import"./mysql2-HVwznT_d.js";import"net";import"events";import"process";import"timers";import"tls";import"zlib";import"node:process";import"./better-auth-B2r-Xofv.js";import"./kysely-9kO2vj_T.js";import"node:crypto";import"./noble-DY0vnRA-.js";import"node:fs/promises";import"node:os";import"./multer-RX-gfMuA.js";import"fs/promises";import"./jszip-BoIs7TcQ.js";import"node:util";import"http";import"https";import"assert";import"./pdf-lib-MF9mTnF3.js";const a=e(import.meta.url);async function eo(s,r){var t;try{const[o]=await i.execute(m`
      SELECT COUNT(*) as cnt
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'form_template_fields'
        AND COLUMN_NAME = 'logic_json'
    `),p=((t=o[0])==null?void 0:t.cnt)??0;if(Number(p)===0)return await i.execute(m`
        ALTER TABLE form_template_fields
        ADD COLUMN logic_json TEXT NULL AFTER settings_json
      `),r.json({ok:!0,message:"logic_json column added"});r.json({ok:!0,message:"logic_json column already exists"})}catch(o){console.error("migrate-form-logic error:",o),r.status(500).json({error:String(o)})}}export{eo as default};
