import{createRequire as c}from"module";import{g as L,d as n,p as A}from"../server.bundle.mjs";import{j as u,s}from"./drizzle-Bu3hp1FF.js";import"./express-WU0_rYSr.js";import"tty";import"os";import"util";import"path";import"./iconv-DatUeE_T.js";import"buffer";import"string_decoder";import"node:zlib";import"./es-abstract-B57Whf45.js";import"url";import"node:fs";import"node:path";import"fs";import"crypto";import"node:http";import"node:buffer";import"node:querystring";import"node:net";import"stream";import"node:events";import"./mysql2-BJ7xsy_S.js";import"net";import"events";import"process";import"timers";import"tls";import"zlib";import"node:process";import"./better-auth-CQVzbiZe.js";import"./kysely-9kO2vj_T.js";import"node:crypto";import"./noble-DY0vnRA-.js";import"./opentelemetry-MOfsRXlr.js";import"node:fs/promises";import"node:os";import"fs/promises";import"./multer-aeOynLMg.js";import"http";import"https";import"assert";const O=c(import.meta.url);async function pt(E,r){try{const o=L(),m=new Headers;for(const[a,t]of Object.entries(E.headers))t&&m.set(a,Array.isArray(t)?t[0]:t);const i=await o.api.getSession({headers:m});if(!(i!=null&&i.user))return r.status(401).json({error:"Unauthorised"});const e=await n.query.profiles.findFirst({where:u(A.userId,i.user.id)});if(!(e!=null&&e.companyId))return r.status(403).json({error:"No company"});if(!["owner","admin"].includes(e.role))return r.status(403).json({error:"Owner/Admin only"});await n.execute(s`
      CREATE TABLE IF NOT EXISTS company_settings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_id INT NOT NULL UNIQUE,
        structure_json LONGTEXT NULL,
        dazza_json LONGTEXT NULL,
        banner_json LONGTEXT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);async function p(a,t){var T;const[N]=await n.execute(s`
        SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'company_settings' AND COLUMN_NAME = ${a}
      `);(((T=N[0])==null?void 0:T.cnt)??0)===0&&await n.execute(s.raw(`ALTER TABLE \`company_settings\` ADD COLUMN \`${a}\` ${t}`))}await p("banner_json","LONGTEXT NULL"),await p("pdf_json","LONGTEXT NULL"),r.json({ok:!0,message:"company_settings table ready"})}catch(o){console.error("migrate-company-settings error:",o),r.status(500).json({error:String(o)})}}export{pt as default};
