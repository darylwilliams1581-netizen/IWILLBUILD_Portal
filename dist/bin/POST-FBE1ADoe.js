import{createRequire as A}from"module";import{d as p}from"../server.bundle.mjs";import{s as m}from"./drizzle-CZ2vWAZ3.js";import"./express-C3pMhyZZ.js";import"tty";import"os";import"util";import"path";import"./iconv-DatUeE_T.js";import"buffer";import"string_decoder";import"node:zlib";import"./es-abstract-B57Whf45.js";import"url";import"node:fs";import"node:path";import"fs";import"crypto";import"node:http";import"node:buffer";import"node:querystring";import"node:net";import"stream";import"node:events";import"./mysql2-HVwznT_d.js";import"net";import"events";import"process";import"timers";import"tls";import"zlib";import"node:process";import"./better-auth-B2r-Xofv.js";import"./kysely-9kO2vj_T.js";import"node:crypto";import"./noble-DY0vnRA-.js";import"node:fs/promises";import"node:os";import"./multer-RX-gfMuA.js";import"fs/promises";import"./jszip-BoIs7TcQ.js";import"node:util";import"http";import"https";import"assert";const O=A(import.meta.url);async function er(E,s){const t=[];async function L(r,i){const e=(await p.execute(m`
      SELECT COUNT(*) as cnt
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ${r}
        AND COLUMN_NAME = ${i}
    `))[0];return Number((e==null?void 0:e.cnt)??0)>0}const N=[["status","VARCHAR(30) NOT NULL DEFAULT 'active'"],["perm_jobs","BOOLEAN NOT NULL DEFAULT 1"],["perm_fleet","BOOLEAN NOT NULL DEFAULT 1"],["perm_forms","BOOLEAN NOT NULL DEFAULT 1"],["perm_files","BOOLEAN NOT NULL DEFAULT 1"],["perm_estimating","BOOLEAN NOT NULL DEFAULT 1"],["perm_dazza_ai","BOOLEAN NOT NULL DEFAULT 1"],["perm_admin","BOOLEAN NOT NULL DEFAULT 0"],["perm_see_dollars","BOOLEAN NOT NULL DEFAULT 1"],["perm_invite_users","BOOLEAN NOT NULL DEFAULT 0"],["perm_delete_records","BOOLEAN NOT NULL DEFAULT 0"]];for(const[r,i]of N)try{await L("profiles",r)?t.push(`profiles.${r}: already exists`):(await p.execute(m.raw(`ALTER TABLE profiles ADD COLUMN ${r} ${i}`)),t.push(`profiles.${r}: added`))}catch(o){t.push(`profiles.${r} error: ${String(o)}`)}try{await p.execute(m`
      UPDATE profiles
      SET perm_admin = 1,
          perm_invite_users = 1,
          perm_delete_records = 1
      WHERE role IN ('admin', 'owner')
    `),t.push("profiles: admin permissions backfilled")}catch(r){t.push(`profiles admin backfill error: ${String(r)}`)}s.json({ok:!0,results:t})}export{er as default};
