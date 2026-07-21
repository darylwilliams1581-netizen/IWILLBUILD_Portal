import{createRequire as s}from"module";import{d as A}from"../server.bundle.mjs";import{s as _}from"./drizzle-CZ2vWAZ3.js";import"./express-C3pMhyZZ.js";import"tty";import"os";import"util";import"path";import"./iconv-DatUeE_T.js";import"buffer";import"string_decoder";import"node:zlib";import"./es-abstract-B57Whf45.js";import"url";import"node:fs";import"node:path";import"fs";import"crypto";import"node:http";import"node:buffer";import"node:querystring";import"node:net";import"stream";import"node:events";import"./mysql2-HVwznT_d.js";import"net";import"events";import"process";import"timers";import"tls";import"zlib";import"node:process";import"./better-auth-B2r-Xofv.js";import"./kysely-9kO2vj_T.js";import"node:crypto";import"./noble-DY0vnRA-.js";import"node:fs/promises";import"node:os";import"./multer-RX-gfMuA.js";import"fs/promises";import"./jszip-BoIs7TcQ.js";import"node:util";import"http";import"https";import"assert";import"./pdf-lib-MF9mTnF3.js";const T=s(import.meta.url);async function ni(p,e){const r=[];async function i(t,L){try{await A.execute(_.raw(L)),r.push(`✓ ${t}`)}catch(o){const a=String((o==null?void 0:o.message)??o);a.includes("already exists")||a.includes("Duplicate column name")||a.includes("ER_DUP_FIELDNAME")||a.includes("ER_TABLE_EXISTS")?r.push(`~ ${t} (already exists)`):(r.push(`✗ ${t}: ${a}`),console.warn(`[migrate-plan-manager-v3] ${t} failed:`,a))}}await i("project_drawings.title",`
    ALTER TABLE project_drawings ADD COLUMN title VARCHAR(255) NULL
  `),await i("project_drawings.source_file_path",`
    ALTER TABLE project_drawings ADD COLUMN source_file_path VARCHAR(500) NULL
  `),await i("project_drawings.source_file_name",`
    ALTER TABLE project_drawings ADD COLUMN source_file_name VARCHAR(255) NULL
  `),await i("project_drawings.page_count",`
    ALTER TABLE project_drawings ADD COLUMN page_count INT NOT NULL DEFAULT 1
  `),await i("project_drawings.drawing_number",`
    ALTER TABLE project_drawings ADD COLUMN drawing_number VARCHAR(100) NULL
  `),await i("project_drawings.discipline",`
    ALTER TABLE project_drawings ADD COLUMN discipline VARCHAR(100) NULL
  `),await i("project_drawings.description",`
    ALTER TABLE project_drawings ADD COLUMN description TEXT NULL
  `),await i("project_drawings.project_id",`
    ALTER TABLE project_drawings ADD COLUMN project_id INT NULL
  `),await i("project_drawings.backfill title from name",`
    UPDATE project_drawings SET title = name WHERE title IS NULL AND name IS NOT NULL AND name != ''
  `),await i("drawing_revisions.locked_at",`
    ALTER TABLE drawing_revisions ADD COLUMN locked_at DATETIME NULL
  `),await i("drawing_revisions.is_current",`
    ALTER TABLE drawing_revisions ADD COLUMN is_current TINYINT(1) NOT NULL DEFAULT 0
  `),await i("drawing_revisions.file_path",`
    ALTER TABLE drawing_revisions ADD COLUMN file_path VARCHAR(500) NULL
  `),await i("drawing_revisions.file_name",`
    ALTER TABLE drawing_revisions ADD COLUMN file_name VARCHAR(255) NULL
  `),await i("drawing_revisions.mime_type",`
    ALTER TABLE drawing_revisions ADD COLUMN mime_type VARCHAR(100) NULL
  `),await i("drawing_revisions.uploaded_by",`
    ALTER TABLE drawing_revisions ADD COLUMN uploaded_by VARCHAR(36) NULL
  `),await i("drawing_audit_log.revision_id",`
    ALTER TABLE drawing_audit_log ADD COLUMN revision_id INT NULL
  `),await i("drawing_annotations.geometry_json",`
    ALTER TABLE drawing_annotations ADD COLUMN geometry_json LONGTEXT NULL
  `),await i("drawing_annotations.style_json",`
    ALTER TABLE drawing_annotations ADD COLUMN style_json LONGTEXT NULL
  `),await i("drawing_annotations.label",`
    ALTER TABLE drawing_annotations ADD COLUMN label VARCHAR(500) NULL
  `),await i("drawing_annotations.author_id",`
    ALTER TABLE drawing_annotations ADD COLUMN author_id VARCHAR(36) NULL
  `),await i("drawing_annotations.page_no",`
    ALTER TABLE drawing_annotations ADD COLUMN page_no INT NOT NULL DEFAULT 1
  `),await i("drawing_annotations.is_locked",`
    ALTER TABLE drawing_annotations ADD COLUMN is_locked TINYINT(1) NOT NULL DEFAULT 0
  `),await i("job_drawing_links.context_note",`
    ALTER TABLE job_drawing_links ADD COLUMN context_note TEXT NULL
  `);const n=r.filter(t=>t.startsWith("✗"));return e.status(n.length?500:200).json({results:r,ok:n.length===0})}export{ni as default};
