import{createRequire as T}from"module";import{d as r}from"../server.bundle.mjs";import{s as i}from"./drizzle-Bu3hp1FF.js";import"./express-WU0_rYSr.js";import"tty";import"os";import"util";import"path";import"./iconv-DatUeE_T.js";import"buffer";import"string_decoder";import"node:zlib";import"./es-abstract-B57Whf45.js";import"url";import"node:fs";import"node:path";import"fs";import"crypto";import"node:http";import"node:buffer";import"node:querystring";import"node:net";import"stream";import"node:events";import"./mysql2-BJ7xsy_S.js";import"net";import"events";import"process";import"timers";import"tls";import"zlib";import"node:process";import"./better-auth-CQVzbiZe.js";import"./kysely-9kO2vj_T.js";import"node:crypto";import"./noble-DY0vnRA-.js";import"./opentelemetry-MOfsRXlr.js";import"node:fs/promises";import"node:os";import"./multer-DNTYjcWN.js";import"fs/promises";import"http";import"https";import"assert";const N=T(import.meta.url);async function W(p,E){const t=[];try{try{await r.execute(i`
        CREATE TABLE IF NOT EXISTS job_todos (
          id INT PRIMARY KEY AUTO_INCREMENT,
          job_id INT NOT NULL,
          company_id INT NOT NULL,
          title VARCHAR(255) NOT NULL,
          due_date VARCHAR(20),
          status VARCHAR(30) NOT NULL DEFAULT 'Open',
          notes TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
          FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
        )
      `),t.push("job_todos: OK")}catch(o){t.push(`job_todos: ${String(o)}`)}try{await r.execute(i`
        CREATE TABLE IF NOT EXISTS job_progress_lines (
          id INT PRIMARY KEY AUTO_INCREMENT,
          job_id INT NOT NULL,
          company_id INT NOT NULL,
          estimate_line_id INT,
          description TEXT NOT NULL,
          quantity VARCHAR(30) NOT NULL DEFAULT '1',
          unit VARCHAR(50),
          rate VARCHAR(30) NOT NULL DEFAULT '0',
          percent_complete INT NOT NULL DEFAULT 0,
          progress_note TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
          FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
        )
      `),t.push("job_progress_lines: OK")}catch(o){t.push(`job_progress_lines: ${String(o)}`)}E.json({ok:!0,results:t})}catch(o){E.status(500).json({error:String(o),results:t})}}export{W as default};
