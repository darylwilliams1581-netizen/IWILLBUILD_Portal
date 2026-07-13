import{createRequire as h}from"module";import{g as y,d as l,p as d}from"../server.bundle.mjs";import{j as g,s as x}from"./drizzle-CZ2vWAZ3.js";import"./express-C3pMhyZZ.js";import"tty";import"os";import"util";import"path";import"./iconv-DatUeE_T.js";import"buffer";import"string_decoder";import"node:zlib";import"./es-abstract-B57Whf45.js";import"url";import"node:fs";import"node:path";import"fs";import"crypto";import"node:http";import"node:buffer";import"node:querystring";import"node:net";import"stream";import"node:events";import"./mysql2-HVwznT_d.js";import"net";import"events";import"process";import"timers";import"tls";import"zlib";import"node:process";import"./better-auth-B2r-Xofv.js";import"./kysely-9kO2vj_T.js";import"node:crypto";import"./noble-DY0vnRA-.js";import"node:fs/promises";import"node:os";import"./multer-CH1RChRJ.js";import"fs/promises";import"./jszip-DFkTEOyz.js";import"node:util";import"http";import"https";import"assert";const D=h(import.meta.url);async function dt(a,t){try{const e=y(),m=new Headers;for(const[f,n]of Object.entries(a.headers))n&&m.set(f,Array.isArray(n)?n[0]:n);const o=await e.api.getSession({headers:m});if(!(o!=null&&o.user))return t.status(401).json({error:"Unauthorised"});const[r]=await l.select().from(d).where(g(d.userId,o.user.id)).limit(1);if(!(r!=null&&r.companyId))return t.status(403).json({error:"No company"});const i=Number(a.params.id);if(!i)return t.status(400).json({error:"Invalid ID"});const[c]=await l.execute(x.raw(`SELECT id, name, builder_json, company_id FROM document_templates WHERE id = ${i} AND company_id = ${r.companyId} LIMIT 1`)),p=Array.isArray(c)?c[0]:null;if(!p)return t.status(404).json({error:"Document not found"});const s=String(p.name??"Document"),u=JSON.stringify(p.builder_json??{}),b=`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${s.replace(/</g,"&lt;")}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; color: #1e293b; }
    h1 { font-size: 22px; margin-bottom: 8px; }
    .meta { font-size: 12px; color: #64748b; margin-bottom: 24px; }
    .content { white-space: pre-wrap; font-size: 13px; line-height: 1.6; }
    @media print { body { margin: 20px; } }
  </style>
</head>
<body>
  <h1>${s.replace(/</g,"&lt;")}</h1>
  <p class="meta">Document ID ${i}</p>
  <div class="content" id="doc-content">Loading document…</div>
  <script>
    try {
      const data = ${u};
      const blocks = Array.isArray(data.blocks) ? data.blocks : [];
      const el = document.getElementById('doc-content');
      function esc(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
      if (blocks.length === 0) {
        el.textContent = 'No content blocks found.';
      } else {
        // eslint-disable-next-line no-unsanitized/property -- block content is escaped via esc() before insertion; raw HTML blocks (richtext/html) are trusted document-builder output stored in the company's own DB record
        el.innerHTML = blocks.map(b => {
          if (b.type === 'text') return '<p>' + esc(b.content) + '</p>';
          if (b.type === 'richtext' || b.type === 'html') return '<p>' + esc(b.content || b.html || '') + '</p>';
          if (b.type === 'heading') return '<h2>' + esc(b.text) + '</h2>';
          if (b.type === 'table') return '<p>[Table block]</p>';
          return '<p>' + esc(JSON.stringify(b)) + '</p>';
        }).join('');
      }
    } catch(e) { document.getElementById('doc-content').textContent = 'Error rendering document.'; }
    window.onload = function() { window.print(); };
  <\/script>
</body>
</html>`;t.setHeader("Content-Type","text/html; charset=utf-8"),t.setHeader("Content-Disposition",`inline; filename="${s.replace(/[^a-z0-9_\-. ]/gi,"_")}.pdf"`),t.send(b)}catch(e){console.error("Document export PDF error:",e),t.status(500).json({error:"Export failed",message:String(e)})}}export{dt as default};
