import{createRequire as p}from"module";import{d as t}from"../server.bundle.mjs";import{s}from"./drizzle-Bu3hp1FF.js";import"./express-WU0_rYSr.js";import"tty";import"os";import"util";import"path";import"./iconv-DatUeE_T.js";import"buffer";import"string_decoder";import"node:zlib";import"./es-abstract-B57Whf45.js";import"url";import"node:fs";import"node:path";import"fs";import"crypto";import"node:http";import"node:buffer";import"node:querystring";import"node:net";import"stream";import"node:events";import"./radix-ui-CM1-jrUu.js";import"./react-router-8V4KISLV.js";import"./react-dom-D6zqUVF0.js";import"async_hooks";import"./zod-B-vvil1C.js";import"node:url";import"./mysql2-BJ7xsy_S.js";import"net";import"events";import"process";import"timers";import"tls";import"zlib";import"node:process";import"./better-auth-DxltITEC.js";import"./kysely-9kO2vj_T.js";import"node:crypto";import"./noble-DY0vnRA-.js";import"node:fs/promises";import"node:os";import"./multer-DNTYjcWN.js";import"fs/promises";import"http";import"https";import"assert";const A=p(import.meta.url);async function oe(m,o){const e=[];try{const[r]=await t.execute(s`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fleet_assets'
    `),i=r.map(a=>a.COLUMN_NAME);i.includes("asset_number")||(await t.execute(s`ALTER TABLE fleet_assets ADD COLUMN asset_number VARCHAR(50)`),e.push("fleet_assets: added asset_number")),i.includes("make_model")||(await t.execute(s`ALTER TABLE fleet_assets ADD COLUMN make_model VARCHAR(255)`),e.push("fleet_assets: added make_model")),i.includes("rego_not_applicable")||(await t.execute(s`ALTER TABLE fleet_assets ADD COLUMN rego_not_applicable TINYINT(1) NOT NULL DEFAULT 0`),e.push("fleet_assets: added rego_not_applicable")),i.includes("archived")||(await t.execute(s`ALTER TABLE fleet_assets ADD COLUMN archived TINYINT(1) NOT NULL DEFAULT 0`),e.push("fleet_assets: added archived")),i.includes("rego")&&(await t.execute(s`ALTER TABLE fleet_assets MODIFY COLUMN rego VARCHAR(50)`),e.push("fleet_assets: widened rego to VARCHAR(50)")),i.includes("status")&&(await t.execute(s`ALTER TABLE fleet_assets MODIFY COLUMN status VARCHAR(60) NOT NULL DEFAULT 'Active'`),e.push("fleet_assets: updated status column")),i.includes("type")&&(await t.execute(s`ALTER TABLE fleet_assets MODIFY COLUMN type VARCHAR(100) NOT NULL DEFAULT 'Vehicle'`),e.push("fleet_assets: updated type column")),e.push("fleet_assets: schema up to date")}catch(r){e.push(`fleet_assets migration error: ${String(r)}`)}try{await t.execute(s`
      CREATE TABLE IF NOT EXISTS fleet_prestarts (
        id INT PRIMARY KEY AUTO_INCREMENT,
        asset_id INT NOT NULL,
        company_id INT NOT NULL,
        user_id VARCHAR(36) NOT NULL,
        operator_name VARCHAR(255),
        km_hours VARCHAR(50),
        safe_to_operate TINYINT(1) NOT NULL DEFAULT 1,
        issue_needs_attention TINYINT(1) NOT NULL DEFAULT 0,
        issue_comment TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (asset_id) REFERENCES fleet_assets(id) ON DELETE CASCADE,
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
      )
    `),e.push("fleet_prestarts: table ready")}catch(r){e.push(`fleet_prestarts error: ${String(r)}`)}o.json({ok:!0,results:e})}export{oe as default};
