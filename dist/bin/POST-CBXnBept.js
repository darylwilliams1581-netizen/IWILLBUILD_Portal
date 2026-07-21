import{createRequire as i}from"module";import{d as m}from"../server.bundle.mjs";import{s as p}from"./drizzle-CZ2vWAZ3.js";import"./express-C3pMhyZZ.js";import"tty";import"os";import"util";import"path";import"./iconv-DatUeE_T.js";import"buffer";import"string_decoder";import"node:zlib";import"./es-abstract-B57Whf45.js";import"url";import"node:fs";import"node:path";import"fs";import"crypto";import"node:http";import"node:buffer";import"node:querystring";import"node:net";import"stream";import"node:events";import"./radix-ui-DB7-u4XC.js";import"./react-router-5dh9OgMp.js";import"./react-dom-CZsMFu04.js";import"async_hooks";import"node:url";import"./mysql2-HVwznT_d.js";import"net";import"events";import"process";import"timers";import"tls";import"zlib";import"node:process";import"./better-auth-B2r-Xofv.js";import"./kysely-9kO2vj_T.js";import"node:crypto";import"./noble-DY0vnRA-.js";import"node:fs/promises";import"node:os";import"./multer-RX-gfMuA.js";import"fs/promises";import"./jszip-BoIs7TcQ.js";import"node:util";import"http";import"https";import"assert";import"./pdf-lib-MF9mTnF3.js";const T=i(import.meta.url);async function pt(e,r){const t=[];try{await m.execute(p`
      CREATE TABLE IF NOT EXISTS form_template_fields (
        id INT PRIMARY KEY AUTO_INCREMENT,
        template_id INT NOT NULL,
        company_id INT NOT NULL,
        label VARCHAR(255) NOT NULL DEFAULT '',
        field_type VARCHAR(50) NOT NULL DEFAULT 'short_text',
        required BOOLEAN NOT NULL DEFAULT FALSE,
        options_json TEXT,
        settings_json TEXT,
        field_order INT NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (template_id) REFERENCES form_templates(id) ON DELETE CASCADE,
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
      )
    `),t.push("form_template_fields table: OK"),r.json({ok:!0,results:t})}catch(o){console.error("migrate-form-fields error:",o),r.status(500).json({ok:!1,error:String(o),results:t})}}export{pt as default};
