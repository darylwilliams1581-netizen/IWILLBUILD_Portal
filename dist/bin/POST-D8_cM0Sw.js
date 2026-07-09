import{createRequire as i}from"module";import{d as m}from"../server.bundle.mjs";import{s as p}from"./drizzle-Bu3hp1FF.js";import"./express-WU0_rYSr.js";import"tty";import"os";import"util";import"path";import"./iconv-DatUeE_T.js";import"buffer";import"string_decoder";import"node:zlib";import"./es-abstract-B57Whf45.js";import"url";import"node:fs";import"node:path";import"fs";import"crypto";import"node:http";import"node:buffer";import"node:querystring";import"node:net";import"stream";import"node:events";import"./radix-ui-CM1-jrUu.js";import"./react-router-8V4KISLV.js";import"./react-dom-D6zqUVF0.js";import"async_hooks";import"./zod-B-vvil1C.js";import"node:url";import"./mysql2-BJ7xsy_S.js";import"net";import"events";import"process";import"timers";import"tls";import"zlib";import"node:process";import"./better-auth-DxltITEC.js";import"./kysely-9kO2vj_T.js";import"node:crypto";import"./noble-DY0vnRA-.js";import"node:fs/promises";import"node:os";import"./multer-DNTYjcWN.js";import"fs/promises";import"./jszip-Yfw9Muqe.js";import"http";import"https";import"assert";const T=i(import.meta.url);async function mo(E,r){const o=[];try{await m.execute(p`
      CREATE TABLE IF NOT EXISTS job_form_submissions (
        id INT PRIMARY KEY AUTO_INCREMENT,
        job_id INT NOT NULL,
        company_id INT NOT NULL,
        template_id INT NOT NULL,
        completed_by_user_id VARCHAR(255) NOT NULL,
        completed_by_name VARCHAR(255),
        status VARCHAR(30) NOT NULL DEFAULT 'in_progress',
        answers_json TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
        FOREIGN KEY (template_id) REFERENCES form_templates(id) ON DELETE CASCADE
      )
    `),o.push("job_form_submissions table: OK"),r.json({ok:!0,results:o})}catch(t){console.error("migrate-job-forms error:",t),r.status(500).json({ok:!1,error:String(t),results:o})}}export{mo as default};
