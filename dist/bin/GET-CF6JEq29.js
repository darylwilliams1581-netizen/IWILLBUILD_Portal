import{createRequire as l}from"module";import{g as b,d as a,p as E,o as j}from"../server.bundle.mjs";import{j as m,k as y,s as n}from"./drizzle-CZ2vWAZ3.js";import"./express-C3pMhyZZ.js";import"tty";import"os";import"util";import"path";import"./iconv-DatUeE_T.js";import"buffer";import"string_decoder";import"node:zlib";import"./es-abstract-B57Whf45.js";import"url";import"node:fs";import"node:path";import"fs";import"crypto";import"node:http";import"node:buffer";import"node:querystring";import"node:net";import"stream";import"node:events";import"./mysql2-HVwznT_d.js";import"net";import"events";import"process";import"timers";import"tls";import"zlib";import"node:process";import"./better-auth-B2r-Xofv.js";import"./kysely-9kO2vj_T.js";import"node:crypto";import"./noble-DY0vnRA-.js";import"node:fs/promises";import"node:os";import"./multer-RX-gfMuA.js";import"fs/promises";import"./jszip-BoIs7TcQ.js";import"node:util";import"http";import"https";import"assert";const R=l(import.meta.url);async function fr(c,o){try{const p=b(),d=new Headers;for(const[r,t]of Object.entries(c.headers))t&&d.set(r,Array.isArray(t)?t[0]:t);const e=await p.api.getSession({headers:d});if(!(e!=null&&e.user))return o.status(401).json({error:"Unauthorised"});const i=await a.query.profiles.findFirst({where:m(E.userId,e.user.id)});if(!(i!=null&&i.companyId))return o.status(403).json({error:"No company"});const s=parseInt(String(c.params.id),10);if(isNaN(s))return o.status(400).json({error:"Invalid job ID"});if(!await a.query.jobs.findFirst({where:y(m(j.id,s),m(j.companyId,i.companyId))}))return o.status(404).json({error:"Job not found"});const[u]=await a.execute(n`
      SELECT po.*,
             c.name as contractor_name,
             c.email as contractor_email,
             c.phone as contractor_phone,
             c.abn as contractor_abn
      FROM job_purchase_orders po
      LEFT JOIN customers c ON c.id = po.contractor_id
      WHERE po.job_id = ${s} AND po.company_id = ${i.companyId}
      ORDER BY po.created_at DESC
    `),h=(u??[]).map(r=>r.id);let f=[];if(h.length>0){const[r]=await a.execute(n`
        SELECT * FROM job_purchase_order_lines
        WHERE purchase_order_id IN (${n.raw(h.join(","))})
        ORDER BY sort_order ASC, id ASC
      `);f=r??[]}const _=(u??[]).map(r=>({...r,lines:f.filter(t=>t.purchase_order_id===r.id)}));o.json({purchaseOrders:_})}catch(p){console.error("GET /api/jobs/:id/purchase-orders error:",p),o.status(500).json({error:"Failed to fetch purchase orders"})}}export{fr as default};
