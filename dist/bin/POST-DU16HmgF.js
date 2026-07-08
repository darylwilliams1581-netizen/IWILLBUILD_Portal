import{createRequire as U}from"module";import{g as q,d as o,p as M,q as h,s as A,t as v}from"../server.bundle.mjs";import{j as E,k as w,s as d,i as k}from"./drizzle-Bu3hp1FF.js";import"./express-WU0_rYSr.js";import"tty";import"os";import"util";import"path";import"./iconv-DatUeE_T.js";import"buffer";import"string_decoder";import"node:zlib";import"./es-abstract-B57Whf45.js";import"url";import"node:fs";import"node:path";import"fs";import"crypto";import"node:http";import"node:buffer";import"node:querystring";import"node:net";import"stream";import"node:events";import"./radix-ui-BjnQoRNV.js";import"./react-router-8V4KISLV.js";import"./react-dom-D6zqUVF0.js";import"async_hooks";import"./zod-Bgt4uOIp.js";import"node:url";import"./mysql2-BJ7xsy_S.js";import"net";import"events";import"process";import"timers";import"tls";import"zlib";import"node:process";import"./better-auth-CQVzbiZe.js";import"./kysely-9kO2vj_T.js";import"node:crypto";import"./noble-DY0vnRA-.js";import"./opentelemetry-MOfsRXlr.js";import"node:fs/promises";import"node:os";import"./multer-DNTYjcWN.js";import"fs/promises";import"http";import"https";import"assert";const B=U(import.meta.url);function H(g){const i=g.toLowerCase();return/labour|labor|worker|carpenter|plumber|electrician|concreter|painter|tiler|roofer|hr |hours/.test(i)?"LABOUR":/plant|excavat|bobcat|crane|hire|equipment|machinery/.test(i)?"PLANT":/subcontract|sub-contract|contractor/.test(i)?"SUBCONTRACTOR":"MATERIAL"}const R={LABOUR:"4000",MATERIAL:"5000",PLANT:"5100",SUBCONTRACTOR:"5200",RECEIPT:"5000",PURCHASE:"5000",VARIATION:"4100",INVOICE_LINE:"4000",CREDIT:"4900",ADJUSTMENT:"9000"};async function kt(g,i){var O;try{const j=q(),L=new Headers;for(const[t,n]of Object.entries(g.headers))n&&L.set(t,Array.isArray(n)?n[0]:n);const s=await j.api.getSession({headers:L});if(!(s!=null&&s.user))return i.status(401).json({error:"Unauthorised"});const r=await o.query.profiles.findFirst({where:E(M.userId,s.user.id)});if(!(r!=null&&r.companyId))return i.status(403).json({error:"No company"});const c=parseInt(String(g.params.id),10);if(isNaN(c))return i.status(400).json({error:"Invalid job ID"});const m=await o.query.jobs.findFirst({where:w(E(h.id,c),E(h.companyId,r.companyId))});if(!m)return i.status(404).json({error:"Job not found"});const[C]=await o.execute(d`
      SELECT source_module, source_id FROM job_cost_ledger
      WHERE company_id = ${r.companyId} AND job_id = ${c}
        AND source_id IS NOT NULL
    `),$=new Set((C??[]).map(t=>`${t.source_module}:${t.source_id}`));let b=0;const f=new Date().toISOString().slice(0,10),N=(await o.select().from(A).where(w(E(A.jobId,c),E(A.companyId,r.companyId)))).filter(t=>["Approved","approved","Accepted","accepted"].includes(t.status));if(N.length>0){const t=N.map(e=>e.id),n=await o.select().from(v).where(k(v.estimateId,t));for(const e of n){const u=`estimate_line:${e.id}`;if($.has(u))continue;const p=parseFloat(e.quantity)||1,l=parseFloat(e.rate)||0,_=Math.round(p*l*100)/100,y=Math.round(_*.1*100)/100,T=_+y,S=H(e.description),a=N.find(x=>x.id===e.estimateId),I=a!=null&&a.createdAt?new Date(a.createdAt).toISOString().slice(0,10):f;await o.execute(d`
          INSERT INTO job_cost_ledger
            (company_id, job_id, job_number, job_title, entry_date, event_type, source_module, source_id,
             description, qty, unit, rate, subtotal, gst, total, gst_inclusive,
             account_code, tax_code, contact_name, contact_type, reference, status,
             created_by_user_id, created_by_name)
          VALUES
            (${r.companyId}, ${c}, ${m.jobNumber??null}, ${m.name??null},
             ${I}, ${S}, 'estimate_line', ${String(e.id)},
             ${e.description}, ${p}, ${e.unit??null}, ${l},
             ${_}, ${y}, ${T}, 0,
             ${R[S]??"5000"}, 'GST',
             NULL, NULL, ${(a==null?void 0:a.title)??null}, 'approved',
             ${s.user.id}, ${s.user.name??null})
        `),$.add(u),b++}}const[D]=await o.execute(d`
      SELECT * FROM invoices
      WHERE job_id = ${c} AND company_id = ${r.companyId}
        AND status NOT IN ('void', 'deleted')
    `);for(const t of D??[]){const[n]=await o.execute(d`
        SELECT * FROM invoice_lines WHERE invoice_id = ${t.id} ORDER BY sort_order ASC
      `);for(const e of n??[]){const u=`invoice_line:${e.id}`;if($.has(u))continue;const p=parseFloat(String(e.quantity??1))||1,l=parseFloat(String(e.rate??0))||0,_=parseFloat(String(e.amount??p*l))||0,y=Math.round(_*.1*100)/100,T=_+y,S=t.issue_date?new Date(String(t.issue_date)).toISOString().slice(0,10):f;let a=null;if(t.customer_id){const[I]=await o.execute(d`SELECT name FROM customers WHERE id = ${t.customer_id} LIMIT 1`);a=((O=I==null?void 0:I[0])==null?void 0:O.name)??null}await o.execute(d`
          INSERT INTO job_cost_ledger
            (company_id, job_id, job_number, job_title, entry_date, event_type, source_module, source_id,
             description, qty, unit, rate, subtotal, gst, total, gst_inclusive,
             account_code, tax_code, contact_name, contact_type, reference, status,
             created_by_user_id, created_by_name)
          VALUES
            (${r.companyId}, ${c}, ${m.jobNumber??null}, ${m.name??null},
             ${S}, 'INVOICE_LINE', 'invoice_line', ${String(e.id)},
             ${String(e.description??"")}, ${p}, ${e.unit?String(e.unit):null}, ${l},
             ${_}, ${y}, ${T}, 0,
             ${R.INVOICE_LINE}, 'GST',
             ${a}, 'customer', ${t.invoice_number??null}, 'approved',
             ${s.user.id}, ${s.user.name??null})
        `),$.add(u),b++}}const[F]=await o.execute(d`
      SELECT jc.*, u.name as user_name
      FROM job_costs jc
      LEFT JOIN user u ON u.id = jc.user_id
      WHERE jc.company_id = ${r.companyId} AND jc.job_id = ${c}
    `);for(const t of F??[]){const n=`job_cost:${t.id}`;if($.has(n))continue;const e=parseFloat(String(t.amount_ex_gst??t.amount??0)),u=parseFloat(String(t.gst_amount??0)),p=e+u,l=t.purchase_date?new Date(String(t.purchase_date)).toISOString().slice(0,10):f;await o.execute(d`
        INSERT INTO job_cost_ledger
          (company_id, job_id, job_number, job_title, entry_date, event_type, source_module, source_id,
           description, qty, unit, rate, subtotal, gst, total, gst_inclusive,
           account_code, tax_code, contact_name, contact_type, reference, status,
           created_by_user_id, created_by_name)
        VALUES
          (${r.companyId}, ${c}, ${m.jobNumber??null}, ${m.name??null},
           ${l}, 'RECEIPT', 'job_cost', ${String(t.id)},
           ${String(t.description??"")}, 1, null, ${e},
           ${e}, ${u}, ${p}, ${t.gst_included?1:0},
           ${R.RECEIPT}, 'GST',
           ${t.merchant?String(t.merchant):null}, 'supplier',
           ${t.notes?String(t.notes):null}, 'approved',
           ${s.user.id}, ${s.user.name??null})
      `),$.add(n),b++}i.json({ok:!0,inserted:b,message:`${b} entries imported into the ledger.`})}catch(j){console.error("POST /api/jobs/:id/ledger/sync error:",j),i.status(500).json({error:"Failed to sync ledger"})}}export{kt as default};
