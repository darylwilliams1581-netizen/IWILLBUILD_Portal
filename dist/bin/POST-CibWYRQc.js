import{createRequire as _}from"module";import{d as o}from"../server.bundle.mjs";import{s as i}from"./drizzle-CZ2vWAZ3.js";import"./express-C3pMhyZZ.js";import"tty";import"os";import"util";import"path";import"./iconv-DatUeE_T.js";import"buffer";import"string_decoder";import"node:zlib";import"./es-abstract-B57Whf45.js";import"url";import"node:fs";import"node:path";import"fs";import"crypto";import"node:http";import"node:buffer";import"node:querystring";import"node:net";import"stream";import"node:events";import"./radix-ui-DB7-u4XC.js";import"./react-router-5dh9OgMp.js";import"./react-dom-CZsMFu04.js";import"async_hooks";import"node:url";import"./mysql2-HVwznT_d.js";import"net";import"events";import"process";import"timers";import"tls";import"zlib";import"node:process";import"./better-auth-B2r-Xofv.js";import"./kysely-9kO2vj_T.js";import"node:crypto";import"./noble-DY0vnRA-.js";import"node:fs/promises";import"node:os";import"./multer-RX-gfMuA.js";import"fs/promises";import"./jszip-BoIs7TcQ.js";import"node:util";import"http";import"https";import"assert";const E=_(import.meta.url);async function nr(l,a){const e=[];try{async function t(r,p){const s=(await o.execute(i`
        SELECT COUNT(*) as cnt
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME   = ${r}
          AND COLUMN_NAME  = ${p}
      `))[0];return Number((s==null?void 0:s.cnt)??0)>0}const n=[["status","VARCHAR(30) NOT NULL DEFAULT 'active'"],["perm_jobs","BOOLEAN NOT NULL DEFAULT 1"],["perm_fleet","BOOLEAN NOT NULL DEFAULT 1"],["perm_forms","BOOLEAN NOT NULL DEFAULT 1"],["perm_files","BOOLEAN NOT NULL DEFAULT 1"],["perm_estimating","BOOLEAN NOT NULL DEFAULT 1"],["perm_dazza_ai","BOOLEAN NOT NULL DEFAULT 1"],["perm_admin","BOOLEAN NOT NULL DEFAULT 0"],["perm_see_dollars","BOOLEAN NOT NULL DEFAULT 1"],["perm_invite_users","BOOLEAN NOT NULL DEFAULT 0"],["perm_delete_records","BOOLEAN NOT NULL DEFAULT 0"]];for(const[r,p]of n)try{await t("profiles",r)?e.push(`profiles.${r}: already exists`):(await o.execute(i.raw(`ALTER TABLE profiles ADD COLUMN ${r} ${p}`)),e.push(`profiles.${r}: added`))}catch(m){e.push(`profiles.${r} error: ${String(m)}`)}try{await o.execute(i`
        UPDATE profiles p
        INNER JOIN (
          SELECT MIN(id) AS min_id
          FROM profiles
          WHERE company_id IS NOT NULL
            AND role IN ('admin', 'owner')
          GROUP BY company_id
        ) AS first_admins ON p.id = first_admins.min_id
        SET p.role               = 'owner',
            p.perm_admin          = 1,
            p.perm_invite_users   = 1,
            p.perm_delete_records = 1,
            p.perm_jobs           = 1,
            p.perm_fleet          = 1,
            p.perm_forms          = 1,
            p.perm_files          = 1,
            p.perm_estimating     = 1,
            p.perm_dazza_ai       = 1,
            p.perm_see_dollars    = 1,
            p.status              = 'active'
        WHERE p.role != 'owner'
      `),e.push("first admin per company promoted to owner")}catch(r){e.push(`owner promotion error: ${String(r)}`)}try{await o.execute(i`
        UPDATE profiles
        SET perm_admin          = 1,
            perm_invite_users   = 1,
            perm_delete_records = 1,
            perm_jobs           = 1,
            perm_fleet          = 1,
            perm_forms          = 1,
            perm_files          = 1,
            perm_estimating     = 1,
            perm_dazza_ai       = 1,
            perm_see_dollars    = 1,
            status              = 'active'
        WHERE role = 'owner'
      `),e.push("owner profiles: all permissions locked on")}catch(r){e.push(`owner perm lock error: ${String(r)}`)}try{await o.execute(i`
        UPDATE profiles
        SET perm_admin          = 1,
            perm_invite_users   = 1,
            perm_delete_records = 1
        WHERE role = 'admin'
      `),e.push("admin profiles: permissions backfilled")}catch(r){e.push(`admin backfill error: ${String(r)}`)}a.json({ok:!0,results:e})}catch(t){console.error("migrate-owner-role error:",t),a.status(500).json({ok:!1,error:String(t),results:e})}}export{nr as default};
