import{createRequire as k}from"module";import{g as R,d as f,p as P}from"../server.bundle.mjs";import{j as U,s as u}from"./drizzle-Bu3hp1FF.js";import"./express-WU0_rYSr.js";import"tty";import"os";import"util";import"path";import"./iconv-DatUeE_T.js";import"buffer";import"string_decoder";import"node:zlib";import"./es-abstract-B57Whf45.js";import"url";import"node:fs";import"node:path";import"fs";import"crypto";import"node:http";import"node:buffer";import"node:querystring";import"node:net";import"stream";import"node:events";import"./radix-ui-CM1-jrUu.js";import"./react-router-8V4KISLV.js";import"./react-dom-D6zqUVF0.js";import"async_hooks";import"./zod-B-vvil1C.js";import"node:url";import"./mysql2-BJ7xsy_S.js";import"net";import"events";import"process";import"timers";import"tls";import"zlib";import"node:process";import"./better-auth-CdAfVNtR.js";import"./kysely-9kO2vj_T.js";import"node:crypto";import"./noble-DY0vnRA-.js";import"node:fs/promises";import"node:os";import"./multer-DNTYjcWN.js";import"fs/promises";import"http";import"https";import"assert";const q=k(import.meta.url);function a(r){return(parseFloat(String(r??0))||0).toLocaleString("en-AU",{style:"currency",currency:"AUD",minimumFractionDigits:2})}function z(r){if(!r)return"—";try{return new Date(r).toLocaleDateString("en-AU",{day:"numeric",month:"short",year:"numeric"})}catch{return String(r)}}function e(r){return r?String(r).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"):""}async function kt(r,n){try{const g=R(),y=new Headers;for(const[i,s]of Object.entries(r.headers))s&&y.set(i,Array.isArray(s)?s[0]:s);const d=await g.api.getSession({headers:y});if(!(d!=null&&d.user))return n.status(401).json({error:"Unauthorised"});const p=await f.query.profiles.findFirst({where:U(P.userId,d.user.id)});if(!(p!=null&&p.companyId))return n.status(403).json({error:"No company"});const x=parseInt(String(r.params.poId),10);if(isNaN(x))return n.status(400).json({error:"Invalid PO ID"});const[c]=await f.execute(u`
      SELECT po.*,
             c.name as contractor_name, c.email as contractor_email,
             c.phone as contractor_phone, c.abn as contractor_abn,
             j.job_number, j.name as job_name, j.address as job_address,
             cust.name as customer_name
      FROM job_purchase_orders po
      LEFT JOIN customers c ON c.id = po.contractor_id
      LEFT JOIN jobs j ON j.id = po.job_id
      LEFT JOIN customers cust ON cust.id = j.customer_id
      WHERE po.id = ${x} AND po.company_id = ${p.companyId}
    `);if(!(c!=null&&c.length))return n.status(404).json({error:"Purchase order not found"});const t=c[0],[w]=await f.execute(u`
      SELECT * FROM job_purchase_order_lines WHERE purchase_order_id = ${x} ORDER BY sort_order ASC
    `),[b]=await f.execute(u`
      SELECT co.name as company_name, co.logo_url,
             cs.pdf_json
      FROM companies co
      LEFT JOIN company_settings cs ON cs.company_id = co.id
      WHERE co.id = ${p.companyId}
    `),l=(b==null?void 0:b[0])??{};let o={};try{o=JSON.parse(String(l.pdf_json??"{}"))}catch{}const v=t.status==="cancelled",j=t.assigned_to_type==="internal",E={draft:"DRAFT",sent:"SENT",completed:"COMPLETED",paid:"PAID",cancelled:"CANCELLED"},T={draft:"#6b7280",sent:"#2563eb",completed:"#059669",paid:"#7c3aed",cancelled:"#dc2626"},A={draft:"#f3f4f6",sent:"#eff6ff",completed:"#ecfdf5",paid:"#f5f3ff",cancelled:"#fef2f2"},m=String(t.status??"draft"),D=E[m]??m.toUpperCase(),h=T[m]??"#6b7280",I=A[m]??"#f3f4f6",O=(w??[]).map(i=>{const s=parseFloat(String(i.qty??1)),S=parseFloat(String(i.rate??0)),N=parseFloat(String(i.amount??s*S));return`
        <tr>
          <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;color:#111827;">${e(String(i.description??""))}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;color:#374151;text-align:center;">${s}${i.unit?` ${e(String(i.unit))}`:""}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;color:#374151;text-align:right;">${a(S)}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;font-weight:600;color:#111827;text-align:right;">${a(N)}</td>
        </tr>`}).join(""),C=v?`
      <div style="background:#fef2f2;border:2px solid #dc2626;border-radius:8px;padding:16px 20px;margin-bottom:24px;text-align:center;">
        <p style="font-size:22px;font-weight:900;color:#dc2626;letter-spacing:4px;margin:0 0 6px 0;">CANCELLED</p>
        <p style="font-size:12px;color:#991b1b;margin:0;">${e(String(t.cancelled_note??"Please note this Purchase Order / Work Order has been cancelled."))}</p>
      </div>`:"",F=j?`<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;padding:12px 14px;">
           <p style="font-size:10px;font-weight:700;color:#1e40af;text-transform:uppercase;letter-spacing:1px;margin:0 0 4px 0;">Assigned To</p>
           <p style="font-size:13px;font-weight:600;color:#1e3a8a;margin:0;">Internal Team${t.assigned_to_name?` — ${e(String(t.assigned_to_name))}`:""}</p>
         </div>`:`<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:12px 14px;">
           <p style="font-size:10px;font-weight:700;color:#166534;text-transform:uppercase;letter-spacing:1px;margin:0 0 4px 0;">Contractor</p>
           <p style="font-size:13px;font-weight:600;color:#14532d;margin:0;">${e(String(t.contractor_name??t.assigned_to_name??"—"))}</p>
           ${t.contractor_email?`<p style="font-size:11px;color:#166534;margin:2px 0 0 0;">${e(String(t.contractor_email))}</p>`:""}
           ${t.contractor_phone?`<p style="font-size:11px;color:#166534;margin:2px 0 0 0;">${e(String(t.contractor_phone))}</p>`:""}
           ${t.contractor_abn?`<p style="font-size:11px;color:#166534;margin:2px 0 0 0;">ABN: ${e(String(t.contractor_abn))}</p>`:""}
         </div>`,$=o.footerText||o.paymentTerms||"",_=o.estimateDisclaimer||"",L=`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${e(String(t.po_number))} — ${e(String(t.title??"Purchase Order"))}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; color: #111827; background: #fff; }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .no-print { display: none; }
  }
</style>
</head>
<body style="padding:32px 40px;max-width:800px;margin:0 auto;">

  <!-- Header -->
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:28px;padding-bottom:20px;border-bottom:2px solid #f97316;">
    <div>
      ${l.logo_url?`<img src="${e(String(l.logo_url))}" alt="Logo" style="max-height:56px;max-width:180px;object-fit:contain;margin-bottom:8px;" />`:""}
      <p style="font-size:18px;font-weight:800;color:#111827;">${e(String(l.company_name??""))}</p>
      ${o.businessAbn?`<p style="font-size:11px;color:#6b7280;">ABN: ${e(o.businessAbn)}</p>`:""}
      ${o.businessPhone?`<p style="font-size:11px;color:#6b7280;">${e(o.businessPhone)}</p>`:""}
      ${o.businessEmail?`<p style="font-size:11px;color:#6b7280;">${e(o.businessEmail)}</p>`:""}
      ${o.businessAddress?`<p style="font-size:11px;color:#6b7280;">${e(o.businessAddress)}</p>`:""}
    </div>
    <div style="text-align:right;">
      <p style="font-size:22px;font-weight:900;color:#f97316;letter-spacing:-0.5px;">PURCHASE ORDER</p>
      <p style="font-size:16px;font-weight:700;color:#111827;margin-top:4px;">${e(String(t.po_number))}</p>
      <span style="display:inline-block;margin-top:8px;padding:4px 12px;background:${I};color:${h};border:1px solid ${h};border-radius:20px;font-size:11px;font-weight:700;letter-spacing:1px;">${D}</span>
    </div>
  </div>

  ${C}

  <!-- Job Info -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:14px;">
      <p style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Job Details</p>
      <p style="font-size:13px;font-weight:700;color:#111827;">${e(String(t.job_number??""))} — ${e(String(t.job_name??""))}</p>
      ${t.job_address?`<p style="font-size:11px;color:#6b7280;margin-top:3px;">${e(String(t.job_address))}</p>`:""}
      ${t.customer_name?`<p style="font-size:11px;color:#6b7280;margin-top:3px;">Client: ${e(String(t.customer_name))}</p>`:""}
    </div>
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:14px;">
      <p style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Schedule</p>
      <p style="font-size:12px;color:#374151;">Start: <strong>${z(String(t.start_date??""))}</strong></p>
      <p style="font-size:12px;color:#374151;margin-top:3px;">Finish: <strong>${z(String(t.finish_date??""))}</strong></p>
      ${t.trade_type?`<p style="font-size:12px;color:#374151;margin-top:3px;">Trade: <strong>${e(String(t.trade_type))}</strong></p>`:""}
    </div>
  </div>

  <!-- Assignment -->
  <div style="margin-bottom:20px;">
    ${F}
  </div>

  <!-- Title -->
  ${t.title?`<p style="font-size:15px;font-weight:700;color:#111827;margin-bottom:12px;">${e(String(t.title))}</p>`:""}

  <!-- Instructions -->
  ${t.instructions?`
  <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:12px 14px;margin-bottom:20px;">
    <p style="font-size:10px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Instructions / Comments</p>
    <p style="font-size:12px;color:#78350f;white-space:pre-wrap;">${e(String(t.instructions))}</p>
  </div>`:""}

  <!-- Scope Lines -->
  <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
    <thead>
      <tr style="background:#f97316;">
        <th style="padding:10px;text-align:left;font-size:11px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:0.5px;">Description</th>
        <th style="padding:10px;text-align:center;font-size:11px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:0.5px;white-space:nowrap;">Qty / Unit</th>
        <th style="padding:10px;text-align:right;font-size:11px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:0.5px;">Rate</th>
        <th style="padding:10px;text-align:right;font-size:11px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:0.5px;">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${O||'<tr><td colspan="4" style="padding:16px;text-align:center;color:#9ca3af;font-size:12px;">No line items</td></tr>'}
    </tbody>
  </table>

  <!-- Totals -->
  <div style="display:flex;justify-content:flex-end;margin-bottom:28px;">
    <div style="min-width:240px;">
      <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #e5e7eb;">
        <span style="font-size:12px;color:#6b7280;">Subtotal (ex GST)</span>
        <span style="font-size:12px;font-weight:600;color:#111827;">${a(t.subtotal)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #e5e7eb;">
        <span style="font-size:12px;color:#6b7280;">GST (10%)</span>
        <span style="font-size:12px;font-weight:600;color:#111827;">${a(t.gst)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;padding:10px 0;background:#f97316;border-radius:6px;margin-top:4px;padding-left:12px;padding-right:12px;">
        <span style="font-size:14px;font-weight:800;color:#fff;">TOTAL</span>
        <span style="font-size:14px;font-weight:800;color:#fff;">${a(t.total)}</span>
      </div>
    </div>
  </div>

  <!-- Footer / Disclaimer -->
  ${_?`<div style="border-top:1px solid #e5e7eb;padding-top:14px;margin-bottom:12px;"><p style="font-size:10px;color:#9ca3af;white-space:pre-wrap;">${e(_)}</p></div>`:""}
  ${$?`<div style="border-top:1px solid #e5e7eb;padding-top:10px;"><p style="font-size:10px;color:#9ca3af;text-align:center;">${e($)}</p></div>`:""}

  <p style="font-size:9px;color:#d1d5db;text-align:center;margin-top:20px;">Generated ${new Date().toLocaleDateString("en-AU",{day:"numeric",month:"long",year:"numeric"})}</p>
</body>
</html>`;n.setHeader("Content-Type","text/html; charset=utf-8"),n.setHeader("Content-Disposition",`inline; filename="${t.po_number}.html"`),n.send(L)}catch(g){console.error("GET /api/jobs/:id/purchase-orders/:poId/pdf error:",g),n.status(500).json({error:"Failed to generate PDF"})}}export{kt as default};
