import{createRequire as u}from"module";import{g as d,d as e,p as n}from"../server.bundle.mjs";import{j as T,s as N}from"./drizzle-Bu3hp1FF.js";import"./express-WU0_rYSr.js";import"tty";import"os";import"util";import"path";import"./iconv-DatUeE_T.js";import"buffer";import"string_decoder";import"node:zlib";import"./es-abstract-B57Whf45.js";import"url";import"node:fs";import"node:path";import"fs";import"crypto";import"node:http";import"node:buffer";import"node:querystring";import"node:net";import"stream";import"node:events";import"./radix-ui-BjnQoRNV.js";import"./react-router-8V4KISLV.js";import"./react-dom-D6zqUVF0.js";import"async_hooks";import"node:url";import"./mysql2-BJ7xsy_S.js";import"net";import"events";import"process";import"timers";import"tls";import"zlib";import"node:process";import"./better-auth-CQVzbiZe.js";import"./kysely-9kO2vj_T.js";import"node:crypto";import"./noble-DY0vnRA-.js";import"./opentelemetry-MOfsRXlr.js";import"node:fs/promises";import"node:os";import"./multer-DNTYjcWN.js";import"fs/promises";import"http";import"https";import"assert";const L=u(import.meta.url);async function dr(a,r){try{const t=d(),p=new Headers;for(const[s,i]of Object.entries(a.headers))i&&p.set(s,Array.isArray(i)?i[0]:i);const o=await t.api.getSession({headers:p});if(!(o!=null&&o.user))return r.status(401).json({error:"Unauthorised"});const m=await e.query.profiles.findFirst({where:T(n.userId,o.user.id)});if((m==null?void 0:m.role)!=="owner")return r.status(403).json({error:"Owner only"});await e.execute(N`
      CREATE TABLE IF NOT EXISTS dazza_audit_log (
        id                INT AUTO_INCREMENT PRIMARY KEY,
        user_id           VARCHAR(36) NOT NULL,
        company_id        INT NOT NULL,
        question_summary  VARCHAR(500) NOT NULL,
        modules_used      VARCHAR(255) NOT NULL DEFAULT '',
        dollars_included  TINYINT(1) NOT NULL DEFAULT 0,
        support_mode      TINYINT(1) NOT NULL DEFAULT 0,
        support_company_id INT NULL,
        created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `),r.json({ok:!0,message:"dazza_audit_log table ready"})}catch(t){console.error("migrate-dazza-audit error:",t),r.status(500).json({error:String(t)})}}export{dr as default};
