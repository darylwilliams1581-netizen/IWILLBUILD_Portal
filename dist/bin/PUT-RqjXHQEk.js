import{createRequire as R}from"module";import{g as T,d as a,p as b}from"../server.bundle.mjs";import{j as w,s as r}from"./drizzle-CZ2vWAZ3.js";import"./express-C3pMhyZZ.js";import"tty";import"os";import"util";import"path";import"./iconv-DatUeE_T.js";import"buffer";import"string_decoder";import"node:zlib";import"./es-abstract-B57Whf45.js";import"url";import"node:fs";import"node:path";import"fs";import"crypto";import"node:http";import"node:buffer";import"node:querystring";import"node:net";import"stream";import"node:events";import"./radix-ui-Cfam1uum.js";import"./react-router-5dh9OgMp.js";import"./react-dom-CZsMFu04.js";import"async_hooks";import"./zod-B-vvil1C.js";import"node:url";import"./mysql2-HVwznT_d.js";import"net";import"events";import"process";import"timers";import"tls";import"zlib";import"node:process";import"./better-auth-B2r-Xofv.js";import"./kysely-9kO2vj_T.js";import"node:crypto";import"./noble-DY0vnRA-.js";import"node:fs/promises";import"node:os";import"./multer-CH1RChRJ.js";import"fs/promises";import"./jszip-DFkTEOyz.js";import"node:util";import"http";import"https";import"assert";const v=R(import.meta.url);async function bt(c,o){var d,u,l,_,h;try{const m=T(),f=new Headers;for(const[j,p]of Object.entries(c.headers))p&&f.set(j,Array.isArray(p)?p[0]:p);const s=await m.api.getSession({headers:f});if(!(s!=null&&s.user))return o.status(401).json({error:"Unauthorised"});const i=await a.query.profiles.findFirst({where:w(b.userId,s.user.id)});if(!(i!=null&&i.companyId))return o.status(403).json({error:"No company"});const e=parseInt(String(c.params.poId),10);if(isNaN(e))return o.status(400).json({error:"Invalid PO ID"});const[n]=await a.execute(r`
      SELECT id, status FROM job_purchase_orders WHERE id = ${e} AND company_id = ${i.companyId} LIMIT 1
    `);if(!(n!=null&&n.length))return o.status(404).json({error:"Purchase order not found"});const t=c.body,E=["draft","sent","completed","paid","cancelled"],y=t.status&&E.includes(t.status)?t.status:n[0].status;await a.execute(r`
      UPDATE job_purchase_orders SET
        status           = ${y},
        title            = COALESCE(${((d=t.title)==null?void 0:d.trim())||null}, title),
        instructions     = ${t.instructions!==void 0?((u=t.instructions)==null?void 0:u.trim())||null:r`instructions`},
        start_date       = ${t.startDate!==void 0?t.startDate||null:r`start_date`},
        finish_date      = ${t.finishDate!==void 0?t.finishDate||null:r`finish_date`},
        cancelled_note   = ${t.cancelledNote!==void 0?((l=t.cancelledNote)==null?void 0:l.trim())||null:r`cancelled_note`},
        assigned_to_name = ${t.assignedToName!==void 0?((_=t.assignedToName)==null?void 0:_.trim())||null:r`assigned_to_name`},
        trade_type       = ${t.tradeType!==void 0?((h=t.tradeType)==null?void 0:h.trim())||null:r`trade_type`},
        contractor_id    = ${t.contractorId!==void 0?t.contractorId??null:r`contractor_id`}
      WHERE id = ${e} AND company_id = ${i.companyId}
    `);const[I]=await a.execute(r`
      SELECT po.*, c.name as contractor_name, c.email as contractor_email, c.phone as contractor_phone, c.abn as contractor_abn
      FROM job_purchase_orders po
      LEFT JOIN customers c ON c.id = po.contractor_id
      WHERE po.id = ${e}
    `),[$]=await a.execute(r`
      SELECT * FROM job_purchase_order_lines WHERE purchase_order_id = ${e} ORDER BY sort_order ASC
    `);o.json({purchaseOrder:{...I[0],lines:$??[]}})}catch(m){console.error("PUT /api/jobs/:id/purchase-orders/:poId error:",m),o.status(500).json({error:"Failed to update purchase order"})}}export{bt as default};
