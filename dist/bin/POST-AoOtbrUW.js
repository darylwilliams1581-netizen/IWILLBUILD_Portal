import{createRequire as p}from"module";import{d as e}from"../server.bundle.mjs";import{s as N}from"./drizzle-CZ2vWAZ3.js";import"./express-C3pMhyZZ.js";import"tty";import"os";import"util";import"path";import"./iconv-DatUeE_T.js";import"buffer";import"string_decoder";import"node:zlib";import"./es-abstract-B57Whf45.js";import"url";import"node:fs";import"node:path";import"fs";import"crypto";import"node:http";import"node:buffer";import"node:querystring";import"node:net";import"stream";import"node:events";import"./mysql2-HVwznT_d.js";import"net";import"events";import"process";import"timers";import"tls";import"zlib";import"node:process";import"./better-auth-B2r-Xofv.js";import"./kysely-9kO2vj_T.js";import"node:crypto";import"./noble-DY0vnRA-.js";import"node:fs/promises";import"node:os";import"./multer-RX-gfMuA.js";import"fs/promises";import"./jszip-BoIs7TcQ.js";import"node:util";import"http";import"https";import"assert";const R=p(import.meta.url);async function ET(A,i){const T=[];async function t(E,r){try{await e.execute(N.raw(r)),T.push(`✅ ${E}`)}catch(o){T.push(`⚠️  ${E}: ${String(o)}`)}}await t("Create cost_guide_items",`
    CREATE TABLE IF NOT EXISTS cost_guide_items (
      id INT PRIMARY KEY AUTO_INCREMENT,
      company_id INT NOT NULL,
      description VARCHAR(255) NOT NULL,
      unit VARCHAR(50),
      rate VARCHAR(30) NOT NULL DEFAULT '0',
      sort_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
    )
  `),await t("Create recipes",`
    CREATE TABLE IF NOT EXISTS recipes (
      id INT PRIMARY KEY AUTO_INCREMENT,
      company_id INT NOT NULL,
      title VARCHAR(255) NOT NULL,
      notes TEXT,
      sort_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
    )
  `),await t("Create recipe_lines",`
    CREATE TABLE IF NOT EXISTS recipe_lines (
      id INT PRIMARY KEY AUTO_INCREMENT,
      recipe_id INT NOT NULL,
      description TEXT NOT NULL,
      quantity VARCHAR(30) NOT NULL DEFAULT '1',
      unit VARCHAR(50),
      rate VARCHAR(30) NOT NULL DEFAULT '0',
      line_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
    )
  `),i.json({ok:!0,results:T})}export{ET as default};
