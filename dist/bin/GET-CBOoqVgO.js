import{createRequire as w}from"module";import{g as I,d,p as v,D as O}from"../server.bundle.mjs";import{j as T,s as m}from"./drizzle-Bu3hp1FF.js";import"./express-WU0_rYSr.js";import"tty";import"os";import"util";import"path";import"./iconv-DatUeE_T.js";import"buffer";import"string_decoder";import"node:zlib";import"./es-abstract-B57Whf45.js";import"url";import"node:fs";import"node:path";import"fs";import"crypto";import"node:http";import"node:buffer";import"node:querystring";import"node:net";import"stream";import"node:events";import"./mysql2-BJ7xsy_S.js";import"net";import"events";import"process";import"timers";import"tls";import"zlib";import"node:process";import"./better-auth-CQVzbiZe.js";import"./kysely-9kO2vj_T.js";import"node:crypto";import"./noble-DY0vnRA-.js";import"./opentelemetry-MOfsRXlr.js";import"node:fs/promises";import"node:os";import"./multer-DNTYjcWN.js";import"fs/promises";import"http";import"https";import"assert";const F=w(import.meta.url);async function ye(A,p){try{const u=I(),E=new Headers;for(const[t,e]of Object.entries(A.headers))e&&E.set(t,Array.isArray(e)?e[0]:e);const l=await u.api.getSession({headers:E});if(!(l!=null&&l.user))return p.status(401).json({error:"Unauthorised"});const r=await d.query.profiles.findFirst({where:T(v.userId,l.user.id)});if(!(r!=null&&r.companyId))return p.status(403).json({error:"No company"});const n=r.companyId,$=r.role??"worker",c=$==="owner"||$==="admin"||r.permAdmin===!0,D=c||r.permJobs!==!1,j=c||r.permFleet!==!1,y=c||r.permForms!==!1,N=c||r.permEstimating!==!1,S=c||r.permSeeDollars===!0;let i={...O};if(r.notificationPrefs)try{i={...O,...JSON.parse(r.notificationPrefs)}}catch{}let s=new Set;if(r.notificationPrefs)try{const t=JSON.parse(r.notificationPrefs);Array.isArray(t.readIds)&&(s=new Set(t.readIds))}catch{}if(!i.enabled)return p.json({alerts:[],unreadCount:0});const a=[],_=new Date().toISOString().slice(0,10),b=new Date(Date.now()+336*60*60*1e3).toISOString().slice(0,10),g=new Date(Date.now()-10080*60*1e3).toISOString().slice(0,19).replace("T"," ");if(D&&i.todoOverdue){const[t]=await d.execute(m`SELECT t.id, t.title, t.due_date, j.id as job_id, j.name as job_name
            FROM job_todos t
            JOIN jobs j ON j.id = t.job_id
            WHERE j.company_id = ${n}
              AND t.status = 'Open'
              AND t.due_date IS NOT NULL
              AND t.due_date < ${_}
            ORDER BY t.due_date ASC
            LIMIT 20`);for(const e of t){const o=`todo_overdue_${e.id}`;a.push({id:o,type:"todo_overdue",title:"Overdue To-Do",message:`"${e.title}" on ${e.job_name} was due ${e.due_date}`,link:`/jobs/${e.job_id}?tab=todos`,createdAt:e.due_date,read:s.has(o)})}}if(D&&i.todoDueToday){const[t]=await d.execute(m`SELECT t.id, t.title, j.id as job_id, j.name as job_name
            FROM job_todos t
            JOIN jobs j ON j.id = t.job_id
            WHERE j.company_id = ${n}
              AND t.status = 'Open'
              AND t.due_date = ${_}
            ORDER BY t.id ASC
            LIMIT 20`);for(const e of t){const o=`todo_today_${e.id}`;a.push({id:o,type:"todo_due_today",title:"Due Today",message:`"${e.title}" on ${e.job_name}`,link:`/jobs/${e.job_id}?tab=todos`,createdAt:_,read:s.has(o)})}}if(j&&i.fleetServiceDue){const[t]=await d.execute(m`SELECT id, name, service_date
            FROM fleet_assets
            WHERE company_id = ${n}
              AND archived = 0
              AND service_date IS NOT NULL
              AND service_date <= ${b}
            ORDER BY service_date ASC
            LIMIT 20`);for(const e of t){const o=e.service_date<_,f=`fleet_service_${e.id}`;a.push({id:f,type:"fleet_service_due",title:o?"Service Overdue":"Service Due Soon",message:`${e.name} — service ${o?"was due":"due"} ${e.service_date}`,link:`/fleet/${e.id}`,createdAt:e.service_date,read:s.has(f)})}}if(j&&i.fleetRegoDue){const[t]=await d.execute(m`SELECT id, name, rego_expiry
            FROM fleet_assets
            WHERE company_id = ${n}
              AND archived = 0
              AND rego_not_applicable = 0
              AND rego_expiry IS NOT NULL
              AND rego_expiry <= ${b}
            ORDER BY rego_expiry ASC
            LIMIT 20`);for(const e of t){const o=e.rego_expiry<_,f=`fleet_rego_${e.id}`;a.push({id:f,type:"fleet_rego_due",title:o?"Rego Expired":"Rego Expiring Soon",message:`${e.name} — rego ${o?"expired":"expires"} ${e.rego_expiry}`,link:`/fleet/${e.id}`,createdAt:e.rego_expiry,read:s.has(f)})}}if(j&&i.fleetPrestartFlag){const[t]=await d.execute(m`SELECT fp.id, fp.issue_comment, fp.created_at, fa.id as asset_id, fa.name as asset_name
            FROM fleet_prestarts fp
            JOIN fleet_assets fa ON fa.id = fp.asset_id
            WHERE fa.company_id = ${n}
              AND fp.issue_needs_attention = 1
            ORDER BY fp.created_at DESC
            LIMIT 20`);for(const e of t){const o=`fleet_flag_${e.id}`;a.push({id:o,type:"fleet_flag",title:"Fleet Attention Required",message:`${e.asset_name}: ${e.issue_comment??"Prestart issue flagged"}`,link:`/fleet/${e.asset_id}`,createdAt:String(e.created_at),read:s.has(o)})}}if(y&&i.formCompleted){const[t]=await d.execute(m`SELECT s.id, s.updated_at, ft.name as template_name, j.id as job_id, j.name as job_name
            FROM job_form_submissions s
            LEFT JOIN form_templates ft ON ft.id = s.template_id
            LEFT JOIN jobs j ON j.id = s.job_id
            WHERE s.company_id = ${n}
              AND s.status = 'completed'
              AND s.updated_at >= ${g}
            ORDER BY s.updated_at DESC
            LIMIT 20`);for(const e of t){const o=`form_completed_${e.id}`;a.push({id:o,type:"form_completed",title:"Form Completed",message:`${e.template_name??"Form"} completed${e.job_name?` on ${e.job_name}`:""}`,link:e.job_id?`/jobs/${e.job_id}?tab=forms`:void 0,createdAt:String(e.updated_at),read:s.has(o)})}}if(N&&i.estimateApproved){const[t]=await d.execute(m`SELECT e.id, e.title, e.updated_at, j.name as job_name
            FROM estimates e
            LEFT JOIN jobs j ON j.id = e.job_id
            WHERE e.company_id = ${n}
              AND e.status = 'approved'
              AND e.updated_at >= ${g}
            ORDER BY e.updated_at DESC
            LIMIT 20`);for(const e of t){const o=`estimate_approved_${e.id}`;a.push({id:o,type:"estimate_approved",title:"Estimate Approved",message:S?`${e.title}${e.job_name?` — ${e.job_name}`:""}`:`${e.title}${e.job_name?` — ${e.job_name}`:""}`,link:`/estimates/${e.id}`,createdAt:String(e.updated_at),read:s.has(o)})}}a.sort((t,e)=>t.read!==e.read?t.read?1:-1:new Date(e.createdAt).getTime()-new Date(t.createdAt).getTime());const R=a.filter(t=>!t.read).length;p.json({alerts:a,unreadCount:R})}catch(u){console.error("GET /api/notifications/alerts error:",u),p.status(500).json({error:"Failed to load alerts"})}}export{ye as default};
