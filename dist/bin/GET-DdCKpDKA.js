import{createRequire as h}from"module";import{g as y,d,p as l}from"../server.bundle.mjs";import{j as g,s as x}from"./drizzle-CZ2vWAZ3.js";import"./express-C3pMhyZZ.js";import"tty";import"os";import"util";import"path";import"./iconv-DatUeE_T.js";import"buffer";import"string_decoder";import"node:zlib";import"./es-abstract-B57Whf45.js";import"url";import"node:fs";import"node:path";import"fs";import"crypto";import"node:http";import"node:buffer";import"node:querystring";import"node:net";import"stream";import"node:events";import"./radix-ui-Cfam1uum.js";import"./react-router-5dh9OgMp.js";import"./react-dom-CZsMFu04.js";import"async_hooks";import"./zod-B-vvil1C.js";import"node:url";import"./mysql2-HVwznT_d.js";import"net";import"events";import"process";import"timers";import"tls";import"zlib";import"node:process";import"./better-auth-B2r-Xofv.js";import"./kysely-9kO2vj_T.js";import"node:crypto";import"./noble-DY0vnRA-.js";import"node:fs/promises";import"node:os";import"./multer-3TLq-S4Z.js";import"fs/promises";import"http";import"https";import"assert";const I=h(import.meta.url);async function ht(a,t){try{const o=y(),s=new Headers;for(const[b,i]of Object.entries(a.headers))i&&s.set(b,Array.isArray(i)?i[0]:i);const r=await o.api.getSession({headers:s});if(!(r!=null&&r.user))return t.status(401).json({error:"Unauthorised"});const[e]=await d.select().from(l).where(g(l.userId,r.user.id)).limit(1);if(!(e!=null&&e.companyId))return t.status(403).json({error:"No company"});const n=Number(a.params.id);if(!n)return t.status(400).json({error:"Invalid ID"});const[c]=await d.execute(x.raw(`SELECT id, name, builder_json, company_id FROM document_templates WHERE id = ${n} AND company_id = ${e.companyId} LIMIT 1`)),m=Array.isArray(c)?c[0]:null;if(!m)return t.status(404).json({error:"Document not found"});const p=String(m.name??"Document"),u=JSON.stringify(m.builder_json??{}),f=`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${p.replace(/</g,"&lt;")}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; color: #1e293b; }
    h1 { font-size: 22px; margin-bottom: 8px; }
    .meta { font-size: 12px; color: #64748b; margin-bottom: 24px; }
    .content { white-space: pre-wrap; font-size: 13px; line-height: 1.6; }
    @media print { body { margin: 20px; } }
  </style>
</head>
<body>
  <h1>${p.replace(/</g,"&lt;")}</h1>
  <p class="meta">Exported from IWILLBUILD — Document ID ${n}</p>
  <div class="content" id="doc-content">Loading document…</div>
  <script>
    try {
      const data = ${u};
      const blocks = Array.isArray(data.blocks) ? data.blocks : [];
      const el = document.getElementById('doc-content');
      if (blocks.length === 0) {
        el.textContent = 'No content blocks found.';
      } else {
        el.innerHTML = blocks.map(b => {
          if (b.type === 'text' || b.type === 'richtext') return '<p>' + (b.content || b.html || '') + '</p>';
          if (b.type === 'heading') return '<h2>' + (b.text || '') + '</h2>';
          if (b.type === 'table') return '<p>[Table block]</p>';
          return '<p>' + JSON.stringify(b) + '</p>';
        }).join('');
      }
    } catch(e) { document.getElementById('doc-content').textContent = 'Error rendering document.'; }
    window.onload = function() { window.print(); };
  <\/script>
</body>
</html>`;t.setHeader("Content-Type","text/html; charset=utf-8"),t.setHeader("Content-Disposition",`inline; filename="${p.replace(/[^a-z0-9_\-. ]/gi,"_")}.pdf"`),t.send(f)}catch(o){console.error("Document export PDF error:",o),t.status(500).json({error:"Export failed",message:String(o)})}}export{ht as default};
