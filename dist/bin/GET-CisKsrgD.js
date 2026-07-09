import{createRequire as b}from"module";import{g as v,d as E,p as U}from"../server.bundle.mjs";import{j as T,s as D}from"./drizzle-Bu3hp1FF.js";import"./express-WU0_rYSr.js";import"tty";import"os";import"util";import"path";import"./iconv-DatUeE_T.js";import"buffer";import"string_decoder";import"node:zlib";import"./es-abstract-B57Whf45.js";import"url";import"node:fs";import"node:path";import"fs";import"crypto";import"node:http";import"node:buffer";import"node:querystring";import"node:net";import"stream";import"node:events";import"./radix-ui-CM1-jrUu.js";import"./react-router-8V4KISLV.js";import"./react-dom-D6zqUVF0.js";import"async_hooks";import"./zod-B-vvil1C.js";import"node:url";import"./mysql2-BJ7xsy_S.js";import"net";import"events";import"process";import"timers";import"tls";import"zlib";import"node:process";import"./better-auth-DxltITEC.js";import"./kysely-9kO2vj_T.js";import"node:crypto";import"./noble-DY0vnRA-.js";import"node:fs/promises";import"node:os";import"./multer-DNTYjcWN.js";import"fs/promises";import"./jszip-Yfw9Muqe.js";import"http";import"https";import"assert";const R=b(import.meta.url);function d(e){return String(e).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;")}function x(e){return e.replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim()}function j(e){const r=[];for(const t of e){const o=t.type??"text";if(o==="heading"||o==="h1"||o==="h2"||o==="h3"){const n=d(x(String(t.text??t.content??"")));r.push(`
        <w:p>
          <w:pPr><w:pStyle w:val="Heading1"/></w:pPr>
          <w:r><w:rPr><w:b/><w:sz w:val="28"/></w:rPr><w:t xml:space="preserve">${n}</w:t></w:r>
        </w:p>`)}else if(o==="richtext"||o==="text"){const n=String(t.html??t.content??t.text??""),i=d(x(n));i&&r.push(`
        <w:p>
          <w:r><w:t xml:space="preserve">${i}</w:t></w:r>
        </w:p>`)}else if(o==="banner"||o==="safety_badge"){const n=d(x(String(t.label??t.text??t.content??o)));r.push(`
        <w:p>
          <w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">[${n}]</w:t></w:r>
        </w:p>`)}else if(o==="table")r.push(`
        <w:p>
          <w:r><w:t xml:space="preserve">[Table — see original document]</w:t></w:r>
        </w:p>`);else if(o==="page_break")r.push(`
        <w:p>
          <w:r><w:br w:type="page"/></w:r>
        </w:p>`);else{const n=d(x(String(t.text??t.content??t.html??"")));n&&r.push(`
        <w:p>
          <w:r><w:t xml:space="preserve">${n}</w:t></w:r>
        </w:p>`)}}return r.join(`
`)}function B(e,r){const t=j(r);return`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"
  xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    <w:p>
      <w:pPr><w:jc w:val="center"/></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="36"/></w:rPr><w:t>${d(e)}</w:t></w:r>
    </w:p>
    <w:p><w:r><w:t xml:space="preserve"> </w:t></w:r></w:p>
    ${t}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>
    </w:sectPr>
  </w:body>
</w:document>`}function P(e){const r=(()=>{const o=new Uint32Array(256);for(let n=0;n<256;n++){let i=n;for(let c=0;c<8;c++)i=i&1?3988292384^i>>>1:i>>>1;o[n]=i}return o})();let t=4294967295;for(let o=0;o<e.length;o++)t=r[(t^e[o])&255]^t>>>8;return(t^4294967295)>>>0}function S(e){return e.getFullYear()-1980<<9|e.getMonth()+1<<5|e.getDate()}function _(e){return e.getHours()<<11|e.getMinutes()<<5|Math.floor(e.getSeconds()/2)}function k(e){const r=new Date,t=S(r),o=_(r),n=[],i=[];let c=0;for(const l of e){const m=Buffer.from(l.name,"utf8"),g=P(l.data),w=l.data.length,p=Buffer.alloc(30+m.length);p.writeUInt32LE(67324752,0),p.writeUInt16LE(20,4),p.writeUInt16LE(0,6),p.writeUInt16LE(0,8),p.writeUInt16LE(o,10),p.writeUInt16LE(t,12),p.writeUInt32LE(g,14),p.writeUInt32LE(w,18),p.writeUInt32LE(w,22),p.writeUInt16LE(m.length,26),p.writeUInt16LE(0,28),m.copy(p,30);const s=Buffer.alloc(46+m.length);s.writeUInt32LE(33639248,0),s.writeUInt16LE(20,4),s.writeUInt16LE(20,6),s.writeUInt16LE(0,8),s.writeUInt16LE(0,10),s.writeUInt16LE(o,12),s.writeUInt16LE(t,14),s.writeUInt32LE(g,16),s.writeUInt32LE(w,20),s.writeUInt32LE(w,24),s.writeUInt16LE(m.length,28),s.writeUInt16LE(0,30),s.writeUInt16LE(0,32),s.writeUInt16LE(0,34),s.writeUInt16LE(0,36),s.writeUInt32LE(0,38),s.writeUInt32LE(c,42),m.copy(s,46),n.push(p,l.data),i.push(s),c+=p.length+w}const u=Buffer.concat(i),a=Buffer.alloc(22);return a.writeUInt32LE(101010256,0),a.writeUInt16LE(0,4),a.writeUInt16LE(0,6),a.writeUInt16LE(e.length,8),a.writeUInt16LE(e.length,10),a.writeUInt32LE(u.length,12),a.writeUInt32LE(c,16),a.writeUInt16LE(0,20),Buffer.concat([...n,u,a])}async function St(e,r){try{const t=v(),o=new Headers;for(const[f,h]of Object.entries(e.headers))h&&o.set(f,Array.isArray(h)?h[0]:h);const n=await t.api.getSession({headers:o});if(!(n!=null&&n.user))return r.status(401).json({error:"Unauthorised"});const[i]=await E.select().from(U).where(T(U.userId,n.user.id)).limit(1);if(!(i!=null&&i.companyId))return r.status(403).json({error:"No company"});const c=Number(e.params.id);if(!c)return r.status(400).json({error:"Invalid ID"});const[u]=await E.execute(D.raw(`SELECT id, name, builder_json FROM document_templates WHERE id = ${c} AND company_id = ${i.companyId} LIMIT 1`)),a=Array.isArray(u)?u[0]:null;if(!a)return r.status(404).json({error:"Document not found"});const l=String(a.name??"Document");let m=[];try{const f=typeof a.builder_json=="string"?JSON.parse(a.builder_json):a.builder_json;m=Array.isArray(f==null?void 0:f.blocks)?f.blocks:[]}catch{}const g=B(l,m),y=[{name:"[Content_Types].xml",data:Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,"utf8")},{name:"_rels/.rels",data:Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,"utf8")},{name:"word/_rels/document.xml.rels",data:Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`,"utf8")},{name:"word/document.xml",data:Buffer.from(g,"utf8")}],I=k(y),L=l.replace(/[^a-z0-9_\-. ]/gi,"_");r.setHeader("Content-Type","application/vnd.openxmlformats-officedocument.wordprocessingml.document"),r.setHeader("Content-Disposition",`attachment; filename="${L}.docx"`),r.setHeader("Content-Length",I.length),r.send(I)}catch(t){console.error("Document export DOCX error:",t),r.status(500).json({error:"Export failed",message:String(t)})}}export{St as default};
