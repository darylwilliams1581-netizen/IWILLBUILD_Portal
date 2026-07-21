import{createRequire as F}from"module";import{g as x,d as i,p as D,o as w,t as P,u as U}from"../server.bundle.mjs";import{j as $,k as C,s as c}from"./drizzle-CZ2vWAZ3.js";import"./express-C3pMhyZZ.js";import"tty";import"os";import"util";import"path";import"./iconv-DatUeE_T.js";import"buffer";import"string_decoder";import"node:zlib";import"./es-abstract-B57Whf45.js";import"url";import"node:fs";import"node:path";import"fs";import"crypto";import"node:http";import"node:buffer";import"node:querystring";import"node:net";import"stream";import"node:events";import"./radix-ui-DB7-u4XC.js";import"./react-router-5dh9OgMp.js";import"./react-dom-CZsMFu04.js";import"async_hooks";import"node:url";import"./mysql2-HVwznT_d.js";import"net";import"events";import"process";import"timers";import"tls";import"zlib";import"node:process";import"./better-auth-B2r-Xofv.js";import"./kysely-9kO2vj_T.js";import"node:crypto";import"./noble-DY0vnRA-.js";import"node:fs/promises";import"node:os";import"./multer-RX-gfMuA.js";import"fs/promises";import"./jszip-BoIs7TcQ.js";import"node:util";import"http";import"https";import"assert";const v=F(import.meta.url);async function Ct(m,s){var y,h,I,b,f,g,E,j;try{const u=x(),T=new Headers;for(const[t,o]of Object.entries(m.headers))o&&T.set(t,Array.isArray(o)?o[0]:o);const n=await u.api.getSession({headers:T});if(!(n!=null&&n.user))return s.status(401).json({error:"Unauthorised"});const e=await i.query.profiles.findFirst({where:$(D.userId,n.user.id)});if(!(e!=null&&e.companyId))return s.status(403).json({error:"No company"});const p=parseInt(String(m.params.id),10);if(isNaN(p))return s.status(400).json({error:"Invalid job ID"});if(!await i.query.jobs.findFirst({where:C($(w.id,p),$(w.companyId,e.companyId))}))return s.status(404).json({error:"Job not found"});const r=m.body;if(!((y=r.lines)!=null&&y.length))return s.status(400).json({error:"At least one line item is required"});const[l]=await i.execute(c`
      SELECT COUNT(*) as cnt FROM job_purchase_orders WHERE company_id = ${e.companyId}
    `),N=`PO-${(Number(((h=l==null?void 0:l[0])==null?void 0:h.cnt)??0)+1).toString().padStart(4,"0")}`,_=r.lines.reduce((t,o)=>t+(Number(o.amount)||0),0),O=Math.round(_*.1*100)/100,L=_+O,S=r.assignedToType==="contractor"?"contractor":"internal",q=((I=r.title)==null?void 0:I.trim())||`Work Order ${N}`,[A]=await i.execute(c`
      INSERT INTO job_purchase_orders
        (company_id, job_id, contractor_id, assigned_to_type, assigned_to_name, trade_type,
         po_number, title, instructions, start_date, finish_date, status,
         subtotal, gst, total, created_by_user_id)
      VALUES
        (${e.companyId}, ${p},
         ${r.contractorId??null},
         ${S},
         ${((b=r.assignedToName)==null?void 0:b.trim())||null},
         ${((f=r.tradeType)==null?void 0:f.trim())||null},
         ${N}, ${q},
         ${((g=r.instructions)==null?void 0:g.trim())||null},
         ${r.startDate||null},
         ${r.finishDate||null},
         'draft',
         ${_}, ${O}, ${L},
         ${n.user.id})
    `),d=A.insertId;for(let t=0;t<r.lines.length;t++){const o=r.lines[t];await i.execute(c`
        INSERT INTO job_purchase_order_lines
          (purchase_order_id, progress_line_id, description, qty, unit, rate, amount, sort_order)
        VALUES
          (${d}, ${o.progressLineId??null}, ${o.description}, ${o.qty}, ${o.unit??null}, ${o.rate}, ${o.amount}, ${t})
      `)}if(r.lines.some(t=>t.progressLineId))for(const t of r.lines)t.progressLineId&&await i.execute(c`
          UPDATE job_progress_lines SET
            assignment_type  = ${S},
            assigned_to_name = ${((E=r.assignedToName)==null?void 0:E.trim())||null},
            contractor_id    = ${r.contractorId??null},
            trade_type       = ${((j=r.tradeType)==null?void 0:j.trim())||null}
          WHERE id = ${t.progressLineId} AND company_id = ${e.companyId}
        `);const[a]=await i.execute(c`
      SELECT po.*, c.name as contractor_name, c.email as contractor_email, c.phone as contractor_phone, c.abn as contractor_abn
      FROM job_purchase_orders po
      LEFT JOIN customers c ON c.id = po.contractor_id
      WHERE po.id = ${d}
    `),[R]=await i.execute(c`
      SELECT * FROM job_purchase_order_lines WHERE purchase_order_id = ${d} ORDER BY sort_order ASC
    `);s.status(201).json({purchaseOrder:{...(a==null?void 0:a[0])??{},lines:R??[]}});try{const t=a==null?void 0:a[0],o=await P({companyId:e.companyId,jobId:p,sourceModule:"purchase_order",sourceId:String(d),documentType:"purchase_order",title:`${(t==null?void 0:t.po_number)??"PO"} — ${(t==null?void 0:t.title)??"Purchase Order"}`,status:"draft",createdByUserId:n.user.id});await U(o,e.companyId,"created",{eventNote:`Purchase order created: ${(t==null?void 0:t.po_number)??d}`,userId:n.user.id})}catch(t){console.warn("[document-engine] Failed to create document for PO:",t)}}catch(u){console.error("POST /api/jobs/:id/purchase-orders error:",u),s.status(500).json({error:"Failed to create purchase order"})}}export{Ct as default};
