import{createRequire as c}from"module";import{g as L,d as p,p as A}from"../server.bundle.mjs";import{j as u,s as a}from"./drizzle-CZ2vWAZ3.js";import"./express-C3pMhyZZ.js";import"tty";import"os";import"util";import"path";import"./iconv-DatUeE_T.js";import"buffer";import"string_decoder";import"node:zlib";import"./es-abstract-B57Whf45.js";import"url";import"node:fs";import"node:path";import"fs";import"crypto";import"node:http";import"node:buffer";import"node:querystring";import"node:net";import"stream";import"node:events";import"./radix-ui-DB7-u4XC.js";import"./react-router-5dh9OgMp.js";import"./react-dom-CZsMFu04.js";import"async_hooks";import"node:url";import"./mysql2-HVwznT_d.js";import"net";import"events";import"process";import"timers";import"tls";import"zlib";import"node:process";import"./better-auth-B2r-Xofv.js";import"./kysely-9kO2vj_T.js";import"node:crypto";import"./noble-DY0vnRA-.js";import"node:fs/promises";import"node:os";import"./multer-RX-gfMuA.js";import"fs/promises";import"./jszip-BoIs7TcQ.js";import"node:util";import"http";import"https";import"assert";const O=c(import.meta.url);async function At(E,r){try{const o=L(),n=new Headers;for(const[m,t]of Object.entries(E.headers))t&&n.set(m,Array.isArray(t)?t[0]:t);const i=await o.api.getSession({headers:n});if(!(i!=null&&i.user))return r.status(401).json({error:"Unauthorised"});const e=await p.query.profiles.findFirst({where:u(A.userId,i.user.id)});if(!(e!=null&&e.companyId))return r.status(403).json({error:"No company"});if(!["owner","admin"].includes(e.role))return r.status(403).json({error:"Owner/Admin only"});await p.execute(a`
      CREATE TABLE IF NOT EXISTS company_settings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_id INT NOT NULL UNIQUE,
        structure_json LONGTEXT NULL,
        dazza_json LONGTEXT NULL,
        banner_json LONGTEXT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);async function s(m,t){var T;const[N]=await p.execute(a`
        SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'company_settings' AND COLUMN_NAME = ${m}
      `);(((T=N[0])==null?void 0:T.cnt)??0)===0&&await p.execute(a.raw(`ALTER TABLE \`company_settings\` ADD COLUMN \`${m}\` ${t}`))}await s("banner_json","LONGTEXT NULL"),await s("pdf_json","LONGTEXT NULL"),r.json({ok:!0,message:"company_settings table ready"})}catch(o){console.error("migrate-company-settings error:",o),r.status(500).json({error:String(o)})}}export{At as default};
