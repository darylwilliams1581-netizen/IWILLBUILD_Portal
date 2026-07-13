import{createRequire as u}from"module";import{g as d,d as p,p as n}from"../server.bundle.mjs";import{j as T,s as N}from"./drizzle-CZ2vWAZ3.js";import"./express-C3pMhyZZ.js";import"tty";import"os";import"util";import"path";import"./iconv-DatUeE_T.js";import"buffer";import"string_decoder";import"node:zlib";import"./es-abstract-B57Whf45.js";import"url";import"node:fs";import"node:path";import"fs";import"crypto";import"node:http";import"node:buffer";import"node:querystring";import"node:net";import"stream";import"node:events";import"./mysql2-HVwznT_d.js";import"net";import"events";import"process";import"timers";import"tls";import"zlib";import"node:process";import"./better-auth-B2r-Xofv.js";import"./kysely-9kO2vj_T.js";import"node:crypto";import"./noble-DY0vnRA-.js";import"node:fs/promises";import"node:os";import"./multer-CH1RChRJ.js";import"fs/promises";import"./jszip-DFkTEOyz.js";import"node:util";import"http";import"https";import"assert";const L=u(import.meta.url);async function pr(a,r){try{const t=d(),m=new Headers;for(const[s,i]of Object.entries(a.headers))i&&m.set(s,Array.isArray(i)?i[0]:i);const o=await t.api.getSession({headers:m});if(!(o!=null&&o.user))return r.status(401).json({error:"Unauthorised"});const e=await p.query.profiles.findFirst({where:T(n.userId,o.user.id)});if((e==null?void 0:e.role)!=="owner")return r.status(403).json({error:"Owner only"});await p.execute(N`
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
    `),r.json({ok:!0,message:"dazza_audit_log table ready"})}catch(t){console.error("migrate-dazza-audit error:",t),r.status(500).json({error:String(t)})}}export{pr as default};
