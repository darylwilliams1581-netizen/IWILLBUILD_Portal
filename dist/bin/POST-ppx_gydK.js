import{createRequire as j}from"module";import{g as U,d as _,p as k,a as E,w as T,b as C,c as D,r as A,e as W,f as B,h as R,i as O,j as H,k as J}from"../server.bundle.mjs";import{j as M}from"./drizzle-CZ2vWAZ3.js";import"./express-C3pMhyZZ.js";import"tty";import"os";import"util";import"path";import"./iconv-DatUeE_T.js";import"buffer";import"string_decoder";import"node:zlib";import"./es-abstract-B57Whf45.js";import"url";import"node:fs";import"node:path";import"fs";import"crypto";import"node:http";import"node:buffer";import"node:querystring";import"node:net";import"stream";import"node:events";import"./radix-ui-Cfam1uum.js";import"./react-router-5dh9OgMp.js";import"./react-dom-CZsMFu04.js";import"async_hooks";import"node:url";import"./mysql2-HVwznT_d.js";import"net";import"events";import"process";import"timers";import"tls";import"zlib";import"node:process";import"./better-auth-B2r-Xofv.js";import"./kysely-9kO2vj_T.js";import"node:crypto";import"./noble-DY0vnRA-.js";import"node:fs/promises";import"node:os";import"./multer-CH1RChRJ.js";import"fs/promises";import"./jszip-DFkTEOyz.js";import"node:util";import"http";import"https";import"assert";const X=j(import.meta.url);function Y(s){if(!/^[0-9\s+\-*/.()%]+$/.test(s)||s.length>200)return null;let a=0;const c=()=>s[a],d=()=>s[a++],u=()=>{for(;a<s.length&&s[a]===" ";)a++};function r(){let p=f();for(u();a<s.length&&(c()==="+"||c()==="-");){const $=d();u();const S=f();p=$==="+"?p+S:p-S,u()}return p}function f(){let p=g();for(u();a<s.length&&(c()==="*"||c()==="/"||c()==="%");){const $=d();u();const S=g();$==="*"?p*=S:$==="/"?p=S!==0?p/S:NaN:p=p%S,u()}return p}function g(){if(u(),c()==="("){d();const $=r();return u(),c()===")"&&d(),$}if(c()==="-")return d(),-g();if(c()==="+")return d(),g();let p="";for(;a<s.length&&/[0-9.]/.test(s[a]);)p+=d();return p?parseFloat(p):NaN}try{const p=r();return isFinite(p)?p:null}catch{return null}}function w(s,a){return a.length>500?null:a.match(s)}function q(s){const a=s.trim().slice(0,500),c=w(/^(?:what\s+is\s+|calculate\s+|calc\s+|work\s+out\s+)?([0-9\s+\-*/.()%]+)=?$/i,a);if(c){const t=c[1].trim(),o=Y(t);if(o!==null)return`${o}`}const d=w(/(?:add\s+gst\s+to|gst\s+on|plus\s+gst|add\s+10%\s+to)\s*\$?([\d,]+(?:\.\d+)?)/i,a)??w(/\$?([\d,]+(?:\.\d+)?)\s*\+\s*gst/i,a);if(d){const t=parseFloat(d[1].replace(/,/g,""));if(!isNaN(t)){const o=+(t*.1).toFixed(2),n=+(t+o).toFixed(2);return`GST calculation:
• Base: $${t.toLocaleString("en-AU",{minimumFractionDigits:2})}
• GST (10%): $${o.toLocaleString("en-AU",{minimumFractionDigits:2})}
• Total inc. GST: $${n.toLocaleString("en-AU",{minimumFractionDigits:2})}`}}const u=w(/(?:remove\s+gst\s+from|ex\s+gst\s+|excluding\s+gst\s+|gst\s+exclusive\s+of)\s*\$?([\d,]+(?:\.\d+)?)/i,a)??w(/\$?([\d,]+(?:\.\d+)?)\s+ex\.?\s+gst/i,a);if(u){const t=parseFloat(u[1].replace(/,/g,""));if(!isNaN(t)){const o=+(t/1.1).toFixed(2),n=+(t-o).toFixed(2);return`GST removal:
• Total inc. GST: $${t.toLocaleString("en-AU",{minimumFractionDigits:2})}
• GST (10%): $${n.toLocaleString("en-AU",{minimumFractionDigits:2})}
• Base ex. GST: $${o.toLocaleString("en-AU",{minimumFractionDigits:2})}`}}const r=w(/add\s+([\d.]+)%\s+markup\s+(?:to\s+)?\$?([\d,]+(?:\.\d+)?)/i,a);if(r){const t=parseFloat(r[1]),o=parseFloat(r[2].replace(/,/g,""));if(!isNaN(t)&&!isNaN(o)){const n=+(o*t/100).toFixed(2),i=+(o+n).toFixed(2);return`Markup calculation (${t}%):
• Cost: $${o.toLocaleString("en-AU",{minimumFractionDigits:2})}
• Markup (${t}%): $${n.toLocaleString("en-AU",{minimumFractionDigits:2})}
• Sell price: $${i.toLocaleString("en-AU",{minimumFractionDigits:2})}`}}const f=w(/(?:what\s+is\s+)?(\d+(?:\.\d+)?)%\s+margin\s+on\s+\$?([\d,]+(?:\.\d+)?)/i,a);if(f){const t=parseFloat(f[1]),o=parseFloat(f[2].replace(/,/g,""));if(!isNaN(t)&&!isNaN(o)&&t<100){const n=+(o/(1-t/100)).toFixed(2),i=+(n-o).toFixed(2);return`Margin calculation (${t}%):
• Cost: $${o.toLocaleString("en-AU",{minimumFractionDigits:2})}
• Margin (${t}%): $${i.toLocaleString("en-AU",{minimumFractionDigits:2})}
• Sell price: $${n.toLocaleString("en-AU",{minimumFractionDigits:2})}`}}const g=w(/concrete\s+(\d+(?:\.\d+)?)\s*(?:m|metres?|meters?)?\s*[x\u00d7*]|by\s+(\d+(?:\.\d+)?)\s*(?:m|metres?|meters?)?\s*[x\u00d7*]|by\s+(\d+(?:\.\d+)?)\s*(m|mm|metres?|meters?|millimetres?)?/i,a)??w(/(\d+(?:\.\d+)?)\s*(?:m|metres?|meters?)?\s*[x\u00d7]\s*(\d+(?:\.\d+)?)\s*(?:m|metres?|meters?)?\s*[x\u00d7]\s*(\d+(?:\.\d+)?)\s*(m|mm|metres?|meters?|millimetres?)?/i,a.includes("concrete")?a:"");if(g){const t=parseFloat(g[1]??""),o=parseFloat(g[2]??"");let n=parseFloat(g[3]??"");if((g[4]??"m").toLowerCase().startsWith("mm")&&(n=n/1e3),!isNaN(t)&&!isNaN(o)&&!isNaN(n)&&n>0){const l=+(t*o*n).toFixed(3),m=+(l*1.1).toFixed(3);return`Concrete volume:
• Slab: ${t}m × ${o}m × ${n<1?(n*1e3).toFixed(0)+"mm":n+"m"}
• Volume: **${l} m³**
• With 10% waste: **${m} m³**

_Order at least ${m} m³. Verify with your concrete supplier._`}}const p=w(/(?:area\s+of|what\s+is\s+the\s+area)\s+(\d+(?:\.\d+)?)\s*(?:m|metres?|meters?)?\s*(?:x|\u00d7|\*|by)\s*(\d+(?:\.\d+)?)/i,a);if(p){const t=parseFloat(p[1]),o=parseFloat(p[2]);if(!isNaN(t)&&!isNaN(o)){const n=+(t*o).toFixed(2);return`Area calculation:
• ${t}m × ${o}m = **${n} m²**`}}const $=w(/fall\s+(?:for\s+)?(\d+(?:\.\d+)?)\s*m\s+(?:pipe\s+)?(?:at\s+)?1\s*(?::|in)\s*(\d+(?:\.\d+)?)/i,a)??w(/fall\s+(?:for\s+)?(\d+(?:\.\d+)?)\s*m\s*,?\s*1\s*(?::|in)\s*(\d+(?:\.\d+)?)/i,a);if($){const t=parseFloat($[1]),o=parseFloat($[2]);if(!isNaN(t)&&!isNaN(o)&&o>0){const n=+(t/o*1e3).toFixed(0),i=+(t/o).toFixed(3);return`Pipe fall calculation:
• Length: ${t}m at 1:${o}
• Fall: **${n}mm** (${i}m)
• Invert drop: ${n}mm over ${t}m`}}const S=w(/(?:what\s+is\s+)?(\d+(?:\.\d+)?)%\s+of\s+\$?([\d,]+(?:\.\d+)?)/i,a);if(S){const t=parseFloat(S[1]),o=parseFloat(S[2].replace(/,/g,""));if(!isNaN(t)&&!isNaN(o)){const n=+(o*t/100).toFixed(2);return`${t}% of $${o.toLocaleString("en-AU",{minimumFractionDigits:2})} = **$${n.toLocaleString("en-AU",{minimumFractionDigits:2})}**`}}const e=w(/perimeter\s+(?:of\s+)?(\d+(?:\.\d+)?)\s*(?:m|metres?|meters?)?\s*(?:x|\u00d7|\*|by)\s*(\d+(?:\.\d+)?)/i,a);if(e){const t=parseFloat(e[1]),o=parseFloat(e[2]);if(!isNaN(t)&&!isNaN(o)){const n=+(2*(t+o)).toFixed(2);return`Perimeter:
• ${t}m × ${o}m rectangle = **${n} lineal metres**`}}return null}function P(s,a){var r,f,g,p,$,S;const c=s.toLowerCase().trim(),d=a.permissions,u=a.companyName;if(/another company|other company|different company|competitor|someone elses?\s+(?:quote|job|data|estimate)/i.test(c))return`I can't access another company's private IWILLBUILD data. I only have access to ${u}'s data.`;if(/how many jobs|job count|number of jobs|total jobs/i.test(c)){if(!d.canJobs)return"You don't have Jobs access.";const e=((r=a.jobs)==null?void 0:r.length)??0;return e===0?`📋 From IWILLBUILD data:
No jobs found for ${u} yet.

📦 Source modules:
Jobs

📊 Confidence:
High`:`📋 From IWILLBUILD data:
There ${e===1?"is":"are"} **${e}** job${e===1?"":"s"} in IWILLBUILD for ${u}.

📦 Source modules:
Jobs

📊 Confidence:
High`}if(/active jobs|open jobs|current jobs|list.*jobs|jobs.*list|show.*jobs/i.test(c)){if(!d.canJobs)return"You don't have Jobs access.";const t=(a.jobs??[]).filter(n=>!["completed","cancelled"].includes(String(n.status??"").toLowerCase()));if(t.length===0)return`📋 From IWILLBUILD data:
No active jobs found for ${u}.

📦 Source modules:
Jobs

📊 Confidence:
High`;const o=t.slice(0,12).map(n=>`• **${String(n.name??"Unnamed")}** — ${String(n.status??"Unknown")}${n.client?` | Client: ${String(n.client)}`:""}${n.address?` | ${String(n.address)}`:""}`).join(`
`);return`📋 From IWILLBUILD data:
**${t.length}** active job${t.length===1?"":"s"} for ${u}:
${o}${t.length>12?`
…and ${t.length-12} more.`:""}

📦 Source modules:
Jobs

📊 Confidence:
High`}if(/latest job|newest job|most recent job|last job added|last job created/i.test(c)){if(!d.canJobs)return"You don't have Jobs access.";const e=a.jobs??[];if(e.length===0)return`📋 From IWILLBUILD data:
No jobs found for ${u} yet.

📦 Source modules:
Jobs

📊 Confidence:
High`;const t=e[0];return`📋 From IWILLBUILD data:
The latest job is **${String(t.name??"Unnamed")}**${t.client?` for ${String(t.client)}`:""}${t.status?` — Status: ${String(t.status)}`:""}${t.address?` | Address: ${String(t.address)}`:""}${t.created_at?` (created ${String(t.created_at).slice(0,10)})`:""}.

📦 Source modules:
Jobs

📊 Confidence:
High`}if(/completed jobs|finished jobs|done jobs|jobs.*completed/i.test(c)){if(!d.canJobs)return"You don't have Jobs access.";const t=(a.jobs??[]).filter(n=>String(n.status??"").toLowerCase()==="completed");if(t.length===0)return`📋 From IWILLBUILD data:
No completed jobs found for ${u}.

📦 Source modules:
Jobs

📊 Confidence:
High`;const o=t.slice(0,10).map(n=>`• **${String(n.name??"Unnamed")}**${n.client?` — ${String(n.client)}`:""}`).join(`
`);return`📋 From IWILLBUILD data:
**${t.length}** completed job${t.length===1?"":"s"} for ${u}:
${o}${t.length>10?`
…and ${t.length-10} more.`:""}

📦 Source modules:
Jobs

📊 Confidence:
High`}if(/jobs.*supervisor|supervisor.*jobs|who.*supervising|supervisor.*assigned/i.test(c)){if(!d.canJobs)return"You don't have Jobs access.";const t=(a.jobs??[]).filter(i=>i.supervisor_name||i.assigned_supervisor_user_id);if(t.length===0)return`📋 From IWILLBUILD data:
No jobs with assigned supervisors found for ${u}.

📦 Source modules:
Jobs

📊 Confidence:
High`;const o={};for(const i of t){const l=String(i.supervisor_name??i.assigned_supervisor_user_id??"Unknown");o[l]||(o[l]=[]),o[l].push(String(i.name??"Unnamed"))}const n=Object.entries(o).map(([i,l])=>`• **${i}**: ${l.join(", ")}`).join(`
`);return`📋 From IWILLBUILD data:
Jobs by supervisor for ${u}:
${n}

📦 Source modules:
Jobs

📊 Confidence:
High`}if(/jobs.*attention|attention.*jobs|jobs.*issue|problem.*jobs|overdue.*job|job.*overdue/i.test(c)){if(!d.canJobs)return"You don't have Jobs access.";const e=a.openTodos??[],t=new Date().toISOString().slice(0,10),o=e.filter(i=>i.due_date&&String(i.due_date).slice(0,10)<t);if(o.length===0)return`📋 From IWILLBUILD data:
No jobs with overdue to-dos found for ${u}.

📦 Source modules:
Jobs, To-do

📊 Confidence:
High`;const n=o.slice(0,8).map(i=>`• **${String(i.job_name??"Unknown job")}** — "${String(i.title??"")}" overdue since ${String(i.due_date??"").slice(0,10)}`).join(`
`);return`📋 From IWILLBUILD data:
**${o.length}** overdue to-do${o.length===1?"":"s"} across jobs:
${n}

📦 Source modules:
Jobs, To-do

📊 Confidence:
High`}if(/job.*delay|delay.*job|which jobs.*delayed|most delayed/i.test(c)){if(!d.canJobs)return"You don't have Jobs access.";const e=a.jobDelays??[];if(e.length===0)return`📋 From IWILLBUILD data:
No job delays recorded for ${u}.

📦 Source modules:
Jobs

📊 Confidence:
High`;const o=[...e].sort((i,l)=>Number(l.total_delay_days??0)-Number(i.total_delay_days??0)).slice(0,8).map(i=>`• **${String(i.job_name??"Unknown")}** — ${String(i.total_delay_days??0)} day${Number(i.total_delay_days??0)===1?"":"s"} delay (${String(i.delay_count??0)} event${Number(i.delay_count??0)===1?"":"s"})`).join(`
`),n=e.reduce((i,l)=>i+Number(l.total_delay_days??0),0);return`📋 From IWILLBUILD data:
**${e.length}** job${e.length===1?"":"s"} with delays (${n} total delay days):
${o}

📦 Source modules:
Jobs

📊 Confidence:
High`}if(/jobs.*progress|progress.*jobs|which jobs.*progress|progress recorded|job.*percent|percent.*complete/i.test(c)){if(!d.canJobs)return"You don't have Jobs access.";const e=a.jobProgress??[];if(e.length===0)return`📋 From IWILLBUILD data:
No job progress recorded for ${u} yet.

📦 Source modules:
Progress

📊 Confidence:
High`;const o=[...e].sort((n,i)=>Number(i.avg_percent??0)-Number(n.avg_percent??0)).slice(0,10).map(n=>`• **${String(n.job_name??"Unknown")}** — ${String(n.avg_percent??0)}% complete`).join(`
`);return`📋 From IWILLBUILD data:
**${e.length}** job${e.length===1?"":"s"} with progress recorded:
${o}

📦 Source modules:
Progress

📊 Confidence:
High`}if(/open to.?do|outstanding to.?do|my to.?do|to.?do list|pending task/i.test(c)){if(!d.canJobs)return"You don't have Jobs access.";const e=a.openTodos??[];if(e.length===0)return`📋 From IWILLBUILD data:
No open to-dos found for ${u}.

📦 Source modules:
To-do

📊 Confidence:
High`;const t=e.slice(0,10).map(o=>`• **${String(o.job_name??"Unknown job")}** — "${String(o.title??"")}"${o.due_date?` (due ${String(o.due_date).slice(0,10)})`:""}`).join(`
`);return`📋 From IWILLBUILD data:
**${e.length}** open to-do${e.length===1?"":"s"}:
${t}${e.length>10?`
…and ${e.length-10} more.`:""}

📦 Source modules:
To-do

📊 Confidence:
High`}if(/how many fleet|fleet count|number of fleet|total fleet|how many.*asset|fleet.*asset.*count/i.test(c)){if(!d.canFleet)return"You don't have Fleet access.";const e=((f=a.fleet)==null?void 0:f.length)??0;return e===0?`📋 From IWILLBUILD data:
No fleet assets found for ${u} yet.

📦 Source modules:
Fleet

📊 Confidence:
High`:`📋 From IWILLBUILD data:
There ${e===1?"is":"are"} **${e}** fleet asset${e===1?"":"s"} in IWILLBUILD for ${u}.

📦 Source modules:
Fleet

📊 Confidence:
High`}if(/list.*fleet|show.*fleet|all.*fleet|fleet.*list/i.test(c)){if(!d.canFleet)return"You don't have Fleet access.";const e=a.fleet??[];if(e.length===0)return`📋 From IWILLBUILD data:
No fleet assets found for ${u} yet.

📦 Source modules:
Fleet

📊 Confidence:
High`;const t=e.slice(0,15).map(o=>`• **${String(o.name??"Unnamed")}** — ${String(o.asset_type??o.type??"Asset")}${o.rego?` | Rego: ${String(o.rego)}`:""}`).join(`
`);return`📋 From IWILLBUILD data:
**${e.length}** fleet asset${e.length===1?"":"s"} for ${u}:
${t}${e.length>15?`
…and ${e.length-15} more.`:""}

📦 Source modules:
Fleet

📊 Confidence:
High`}if(/last prestart|latest prestart|most recent prestart|last.*daily check|recent.*prestart/i.test(c)){if(!d.canFleet)return"You don't have Fleet access.";const e=a.prestarts??[];if(e.length===0)return`📋 From IWILLBUILD data:
No prestarts found for ${u} yet.

📦 Source modules:
Fleet

📊 Confidence:
High`;const t=e[0],o=t.issue_needs_attention?` ⚠️ Issue flagged: "${String(t.issue_comment??"")}"`:" No issues flagged.";return`📋 From IWILLBUILD data:
The last prestart was for **${String(t.asset_name??"Unknown asset")}**${t.submitted_by_name?` submitted by ${String(t.submitted_by_name)}`:""}${t.created_at?` on ${String(t.created_at).slice(0,10)}`:""}.${o}

📦 Source modules:
Fleet

📊 Confidence:
High`}if(/next service|service due|when.*service|service.*when|upcoming service/i.test(c)){if(!d.canFleet)return"You don't have Fleet access.";const t=(a.fleet??[]).filter(l=>l.service_date).sort((l,m)=>String(l.service_date).localeCompare(String(m.service_date)));if(t.length===0)return`📋 From IWILLBUILD data:
No service dates recorded for any fleet assets.

📦 Source modules:
Fleet

📊 Confidence:
High`;const o=t[0],n=new Date().toISOString().slice(0,10),i=String(o.service_date).slice(0,10)<n;return`📋 From IWILLBUILD data:
The next service due is **${String(o.name??"Unknown")}** — service date **${String(o.service_date).slice(0,10)}**${i?" ⚠️ (overdue)":""}.

📦 Source modules:
Fleet

📊 Confidence:
High`}if(/rego.*expir|expir.*rego|registration.*due|rego.*due|upcoming.*rego/i.test(c)){if(!d.canFleet)return"You don't have Fleet access.";const e=a.fleet??[],t=new Date().toISOString().slice(0,10),o=e.filter(m=>m.rego_expiry&&!m.rego_not_applicable).sort((m,b)=>String(m.rego_expiry).localeCompare(String(b.rego_expiry))),n=o.filter(m=>String(m.rego_expiry).slice(0,10)<t),i=o.filter(m=>String(m.rego_expiry).slice(0,10)>=t).slice(0,5),l=[];return n.length>0&&(l.push(`⚠️ **${n.length}** asset${n.length===1?"":"s"} with expired rego:`),n.slice(0,5).forEach(m=>l.push(`  • **${String(m.name??"Unknown")}** — expired ${String(m.rego_expiry).slice(0,10)}`))),i.length>0&&(l.push(`
Upcoming rego renewals:`),i.forEach(m=>l.push(`  • **${String(m.name??"Unknown")}** — due ${String(m.rego_expiry).slice(0,10)}`))),l.length===0?`📋 From IWILLBUILD data:
No rego expiry dates recorded for fleet assets.

📦 Source modules:
Fleet

📊 Confidence:
High`:`📋 From IWILLBUILD data:
${l.join(`
`)}

📦 Source modules:
Fleet

📊 Confidence:
High`}if(/fleet issue|fleet flag|fleet problem|fleet.*attention|attention.*fleet/i.test(c)){if(!d.canFleet)return"You don't have Fleet access.";const e=a.fleetFlags??[];if(e.length===0)return`📋 From IWILLBUILD data:
No fleet issues flagged for ${u}.

📦 Source modules:
Fleet

📊 Confidence:
High`;const t=e.slice(0,8).map(o=>`• **${String(o.asset_name??"Unknown")}** — "${String(o.issue_comment??"")}" (${String(o.created_at??"").slice(0,10)})`).join(`
`);return`📋 From IWILLBUILD data:
**${e.length}** fleet issue${e.length===1?"":"s"} flagged:
${t}

📦 Source modules:
Fleet

📊 Confidence:
High`}if(/who.*driving|driving.*who|who.*got.*vehicle|who.*has.*vehicle|who.*checked.*out|currently.*driving|active.*session|who.*in.*the\s+\w+/i.test(c)){if(!d.canFleet)return"You don't have Fleet access.";const e=a.activeDriverSessions??[];if(e.length===0)return`📋 From IWILLBUILD data:
No vehicles are currently being driven.

📦 Source modules:
Fleet · Driver Sessions

📊 Confidence:
High`;const t=e.map(o=>`• **${String(o.asset_name??"Unknown")}** — driven by **${String(o.driver_name??"Unknown")}** since ${String(o.start_at??"").slice(11,16)}`).join(`
`);return`📋 From IWILLBUILD data:
**${e.length}** vehicle${e.length===1?"":"s"} currently being driven:
${t}

📦 Source modules:
Fleet · Driver Sessions

📊 Confidence:
High`}if(/which.*vehicle.*driven|which.*vehicle.*active|vehicles.*being.*driven|active.*vehicle.*session/i.test(c)){if(!d.canFleet)return"You don't have Fleet access.";const e=a.activeDriverSessions??[];return e.length===0?`📋 From IWILLBUILD data:
No vehicles are currently being driven.

📦 Source modules:
Fleet · Driver Sessions

📊 Confidence:
High`:`📋 From IWILLBUILD data:
${e.map(o=>`• **${String(o.asset_name??"Unknown")}** — ${String(o.driver_name??"Unknown")}`).join(`
`)}

📦 Source modules:
Fleet · Driver Sessions

📊 Confidence:
High`}if(/who.*had|who.*drove|who.*was.*driving|who.*last.*drove|last.*driver|had.*yesterday|drove.*yesterday|drove.*last/i.test(c)){if(!d.canFleet)return"You don't have Fleet access.";const e=a.recentDriverSessions??[];if(e.length===0)return`📋 From IWILLBUILD data:
No driver session history found.

📦 Source modules:
Fleet · Driver Sessions

📊 Confidence:
High`;const o=(a.fleet??[]).find(l=>c.includes(String(l.name??"").toLowerCase())),n=o?e.filter(l=>String(l.asset_name??"").toLowerCase()===String(o.name??"").toLowerCase()):e;return n.length===0?`📋 From IWILLBUILD data:
No driver sessions found${o?` for ${String(o.name)}`:""}.

📦 Source modules:
Fleet · Driver Sessions

📊 Confidence:
High`:`📋 From IWILLBUILD data:
${n.slice(0,8).map(l=>{const m=String(l.start_at??"").slice(0,16).replace("T"," "),b=l.end_at?String(l.end_at).slice(0,16).replace("T"," "):"still active";return`• **${String(l.driver_name??"Unknown")}** drove **${String(l.asset_name??"Unknown")}** — ${m} → ${b}`}).join(`
`)}

📦 Source modules:
Fleet · Driver Sessions

📊 Confidence:
High`}if(/when.*stop.*driving|stop.*driving.*when|when.*finish.*driving|finish.*driving.*when/i.test(c)){if(!d.canFleet)return"You don't have Fleet access.";const t=(a.recentDriverSessions??[]).filter(i=>i.status==="completed"&&i.end_at);if(t.length===0)return`📋 From IWILLBUILD data:
No completed driving sessions found.

📦 Source modules:
Fleet · Driver Sessions

📊 Confidence:
High`;const o=t[0],n=String(o.end_at??"").slice(0,16).replace("T"," ");return`📋 From IWILLBUILD data:
**${String(o.driver_name??"Unknown")}** stopped driving **${String(o.asset_name??"Unknown")}** at **${n}**.

📦 Source modules:
Fleet · Driver Sessions

📊 Confidence:
High`}if(/how many prestart|prestart count|number of prestart/i.test(c)){if(!d.canFleet)return"You don't have Fleet access.";const e=a.prestartCount??0;return`📋 From IWILLBUILD data:
**${e}** prestart${e===1?"":"s"} recorded for ${u}.

📦 Source modules:
Fleet

📊 Confidence:
High`}if(/estimate total|quote total|how much.*quoted|total.*estimate|approved.*work|estimate.*dollar|dollar.*estimate|estimate.*total.*see|what.*total.*estimate|estimate.*value/i.test(c)){if(!d.canEstimating)return"You don't have Estimating access.";if(!d.seeDollars)return"I can't show cost values with your current permissions.";const e=a.estimates??[];if(e.length===0)return`📋 From IWILLBUILD data:
No estimates found for ${u} yet.

📦 Source modules:
Estimates

📊 Confidence:
High`;const t=e.filter(i=>String(i.status??"").toLowerCase()==="approved"),o=t.reduce((i,l)=>i+(parseFloat(String(l.subtotal??"0"))||0),0),n=e.reduce((i,l)=>i+(parseFloat(String(l.subtotal??"0"))||0),0);return`📋 From IWILLBUILD data:
**${e.length}** estimate${e.length===1?"":"s"} total.
• All estimates subtotal: **$${n.toLocaleString("en-AU",{minimumFractionDigits:2})}** (ex. markup/GST)
• Approved estimates: **${t.length}** totalling **$${o.toLocaleString("en-AU",{minimumFractionDigits:2})}** (ex. markup/GST)

📦 Source modules:
Estimates

📊 Confidence:
High`}if(/how many estimate|estimate count|number of estimate|how many quote/i.test(c)){if(!d.canEstimating)return"You don't have Estimating access.";const e=((g=a.estimates)==null?void 0:g.length)??0;if(e===0)return`📋 From IWILLBUILD data:
No estimates found for ${u} yet.

📦 Source modules:
Estimates

📊 Confidence:
High`;const t=a.estimates??[],o=t.filter(l=>String(l.status??"").toLowerCase()==="approved").length,n=t.filter(l=>String(l.status??"").toLowerCase()==="draft").length,i=t.filter(l=>String(l.status??"").toLowerCase()==="sent").length;return`📋 From IWILLBUILD data:
**${e}** estimate${e===1?"":"s"} for ${u}:
• Draft: ${n} | Sent: ${i} | Approved: ${o}

📦 Source modules:
Estimates

📊 Confidence:
High`}if(/what estimates|list.*estimate|show.*estimate|estimates.*exist|which estimates|all.*estimate|estimate.*list/i.test(c)){if(!d.canEstimating)return"You don't have Estimating access.";const e=a.estimates??[];if(e.length===0)return`📋 From IWILLBUILD data:
No estimates found for ${u} yet.

📦 Source modules:
Estimates

📊 Confidence:
High`;const t=e.slice(0,15).map(o=>{const n=String(o.status??"Draft"),i=o.job_name?` | Job: ${String(o.job_name)}`:"",l=d.seeDollars&&o.subtotal?` | $${parseFloat(String(o.subtotal)).toLocaleString("en-AU",{minimumFractionDigits:2})}`:"";return`• **${String(o.title??"Unnamed")}** — ${n}${i}${l}`}).join(`
`);return`📋 From IWILLBUILD data:
**${e.length}** estimate${e.length===1?"":"s"} for ${u}:
${t}${e.length>15?`
…and ${e.length-15} more.`:""}

📦 Source modules:
Estimates

📊 Confidence:
High`}if(/approved estimate|approved quote|estimates.*approved/i.test(c)){if(!d.canEstimating)return"You don't have Estimating access.";const t=(a.estimates??[]).filter(n=>String(n.status??"").toLowerCase()==="approved");if(t.length===0)return`📋 From IWILLBUILD data:
No approved estimates found for ${u}.

📦 Source modules:
Estimates

📊 Confidence:
High`;const o=t.slice(0,12).map(n=>{const i=n.job_name?` | Job: ${String(n.job_name)}`:"",l=d.seeDollars&&n.subtotal?` | $${parseFloat(String(n.subtotal)).toLocaleString("en-AU",{minimumFractionDigits:2})}`:"";return`• **${String(n.title??"Unnamed")}**${i}${l}`}).join(`
`);return`📋 From IWILLBUILD data:
**${t.length}** approved estimate${t.length===1?"":"s"} for ${u}:
${o}${t.length>12?`
…and ${t.length-12} more.`:""}

📦 Source modules:
Estimates

📊 Confidence:
High`}if(/draft estimate|draft quote|estimates.*draft/i.test(c)){if(!d.canEstimating)return"You don't have Estimating access.";const t=(a.estimates??[]).filter(n=>String(n.status??"").toLowerCase()==="draft");if(t.length===0)return`📋 From IWILLBUILD data:
No draft estimates found for ${u}.

📦 Source modules:
Estimates

📊 Confidence:
High`;const o=t.slice(0,12).map(n=>{const i=n.job_name?` | Job: ${String(n.job_name)}`:"";return`• **${String(n.title??"Unnamed")}**${i}`}).join(`
`);return`📋 From IWILLBUILD data:
**${t.length}** draft estimate${t.length===1?"":"s"} for ${u}:
${o}${t.length>12?`
…and ${t.length-12} more.`:""}

📦 Source modules:
Estimates

📊 Confidence:
High`}if(/job.*cost|cost.*job|over.*budget|budget.*over|which jobs.*expensive|most expensive job/i.test(c)){if(!d.canJobs)return"You don't have Jobs access.";if(!d.seeDollars)return"I can't show cost values with your current permissions.";const e=a.jobCosts??[];if(e.length===0)return`📋 From IWILLBUILD data:
No job costs recorded for ${u} yet.

📦 Source modules:
Jobs

📊 Confidence:
High`;const o=[...e].sort((i,l)=>Number(l.total_actual??0)-Number(i.total_actual??0)).slice(0,8).map(i=>{const l=Number(i.total_actual??0),m=Number(i.approved_estimate??0),b=m>0&&l>m;return`• **${String(i.job_name??"Unknown")}** — $${l.toLocaleString("en-AU",{minimumFractionDigits:2})} actual${m>0?` vs $${m.toLocaleString("en-AU",{minimumFractionDigits:2})} approved${b?" ⚠️ over budget":""}`:""}`}).join(`
`),n=e.reduce((i,l)=>i+Number(l.total_actual??0),0);return`📋 From IWILLBUILD data:
Job costs for ${u} (total: **$${n.toLocaleString("en-AU",{minimumFractionDigits:2})}**):
${o}

📦 Source modules:
Jobs

📊 Confidence:
High`}if(/how many forms|form count|number of forms|form template|available forms/i.test(c)){if(!d.canForms)return"You don't have Forms access.";const e=((p=a.formTemplates)==null?void 0:p.length)??0;return e===0?`📋 From IWILLBUILD data:
No form templates found for ${u} yet.

📦 Source modules:
Forms

📊 Confidence:
High`:`📋 From IWILLBUILD data:
There ${e===1?"is":"are"} **${e}** form template${e===1?"":"s"} available for ${u}.

📦 Source modules:
Forms

📊 Confidence:
High`}if(/list.*forms|show.*forms|what forms|forms.*available|which forms/i.test(c)){if(!d.canForms)return"You don't have Forms access.";const e=a.formTemplates??[];if(e.length===0)return`📋 From IWILLBUILD data:
No form templates found for ${u} yet.

📦 Source modules:
Forms

📊 Confidence:
High`;const t=e.slice(0,15).map(o=>`• **${String(o.name??"Unnamed")}**${o.category?` (${String(o.category)})`:""}`).join(`
`);return`📋 From IWILLBUILD data:
**${e.length}** form template${e.length===1?"":"s"} for ${u}:
${t}${e.length>15?`
…and ${e.length-15} more.`:""}

📦 Source modules:
Forms

📊 Confidence:
High`}if(/form.*submission|submission.*form|how many.*submitted|forms.*submitted/i.test(c)){if(!d.canForms)return"You don't have Forms access.";const e=(($=a.formSubmissions)==null?void 0:$.length)??0;return`📋 From IWILLBUILD data:
**${e}** form submission${e===1?"":"s"} recorded for ${u}.

📦 Source modules:
Forms

📊 Confidence:
High`}if(/how many files|file count|number of files|total files/i.test(c)){if(!d.canFiles)return"You don't have Files access.";const e=((S=a.files)==null?void 0:S.length)??0;return`📋 From IWILLBUILD data:
**${e}** file${e===1?"":"s"} stored for ${u}.

📦 Source modules:
Files

📊 Confidence:
High`}if(/how many.*share.*link|share.*link.*count|number of.*share|active.*link|secure.*link/i.test(c)){const e=a.shareLinks??[];if(e.length===0)return`📋 From IWILLBUILD data:
No secure share links found for ${u}.

📦 Source modules:
Secure Share

📊 Confidence:
High`;const t=e.filter(i=>!i.revoked&&!i.isExpired&&!i.isMaxed).length,o=e.filter(i=>i.revoked).length,n=e.filter(i=>i.isExpired&&!i.revoked).length;return`📋 From IWILLBUILD data:
**${e.length}** secure share link${e.length===1?"":"s"} for ${u}:
• Active: ${t} | Expired: ${n} | Revoked: ${o}

📦 Source modules:
Secure Share

📊 Confidence:
High`}if(/list.*share.*link|show.*share.*link|what.*share.*link|share.*link.*exist|all.*share.*link/i.test(c)){const e=a.shareLinks??[];if(e.length===0)return`📋 From IWILLBUILD data:
No secure share links found for ${u}.

📦 Source modules:
Secure Share

📊 Confidence:
High`;const t=e.slice(0,15).map(o=>{const n=o.revoked?"🔴 Revoked":o.isExpired?"🟡 Expired":o.isMaxed?"🟡 Limit reached":"🟢 Active",i=`${String(o.target_type??"").replace(/_/g," ")} #${String(o.target_id??"")}`;return`• **${String(o.title??"Untitled")}** — ${n} | ${i} | ${String(o.link_type??"").replace(/_/g," ")}`}).join(`
`);return`📋 From IWILLBUILD data:
**${e.length}** secure share link${e.length===1?"":"s"} for ${u}:
${t}${e.length>15?`
…and ${e.length-15} more.`:""}

📦 Source modules:
Secure Share

📊 Confidence:
High`}if(/expired.*link|revoked.*link|link.*expired|link.*revoked|stale.*link|old.*share.*link/i.test(c)){const e=a.shareLinks??[],t=e.filter(i=>i.isExpired&&!i.revoked),o=e.filter(i=>i.revoked),n=[];return t.length>0&&n.push(`**${t.length}** expired link${t.length===1?"":"s"}:
${t.slice(0,8).map(i=>`• ${String(i.title??"Untitled")} (${String(i.target_type??"").replace(/_/g," ")} #${String(i.target_id??"")})`).join(`
`)}`),o.length>0&&n.push(`**${o.length}** revoked link${o.length===1?"":"s"}:
${o.slice(0,8).map(i=>`• ${String(i.title??"Untitled")}`).join(`
`)}`),n.length===0?`📋 From IWILLBUILD data:
No expired or revoked share links found for ${u}. All links are active.

📦 Source modules:
Secure Share

📊 Confidence:
High`:`📋 From IWILLBUILD data:
${n.join(`

`)}

⚠️ Hygiene tip:
Expired links are harmless but can be confusing. Consider revoking old links you no longer need.

📦 Source modules:
Secure Share

📊 Confidence:
High`}return null}function G(s){var g,p,$,S,e,t,o,n,i;const a=s.permissions,c=s.moduleCounts??{},d=[];if(a.canJobs){const l=c.jobs===-1?"ERR":String(((g=s.jobs)==null?void 0:g.length)??0),m=c.todos===-1?"ERR":String(((p=s.openTodos)==null?void 0:p.length)??0),b=c.progress===-1?"ERR":String((($=s.jobProgress)==null?void 0:$.length)??0);d.push(`Jobs ${l} | Todos ${m} | Progress ${b}`)}if(a.canFleet){const l=c.fleet===-1?"ERR":String(((S=s.fleet)==null?void 0:S.length)??0),m=c.prestarts===-1?"ERR":String(s.prestartCount??0),b=c.fleet_flags===-1?"ERR":String(((e=s.fleetFlags)==null?void 0:e.length)??0);d.push(`Fleet ${l} | Prestarts ${m} | Flags ${b}`)}if(a.canForms){const l=c.form_templates===-1?"ERR":String(((t=s.formTemplates)==null?void 0:t.length)??0),m=c.form_submissions===-1?"ERR":String(((o=s.formSubmissions)==null?void 0:o.length)??0);d.push(`Forms ${l} templates, ${m} submissions`)}if(a.canEstimating){const l=c.estimates===-1?"ERR":String(((n=s.estimates)==null?void 0:n.length)??0);d.push(`Estimates ${l}`)}if(a.canFiles){const l=c.files===-1?"ERR":String(((i=s.files)==null?void 0:i.length)??0);d.push(`Files ${l}`)}const u=c.settings!==-1,r=c.company!==-1;d.push(`Settings ${u?"OK":"ERR"} | Company ${r?"OK":"ERR"}`);let f=`Context loaded: ${d.join(" | ")}`;return s.warnings&&s.warnings.length>0&&(f+=`
⚠️ Warnings (${s.warnings.length}): ${s.warnings.join("; ")}`),f}function Ve(s){var g,p,$,S,e,t,o,n,i,l,m,b,L,F;const{permissions:a,companyKnowledge:c}=s,d=c.tone??"professional",u=new Date().toLocaleDateString("en-AU",{weekday:"long",year:"numeric",month:"long",day:"numeric",timeZone:"Australia/Brisbane"}),r=["You are Dazza, the AI assistant built into the IWILLBUILD construction management portal.","You are a practical, no-nonsense construction industry expert who knows Australian building, WHS, and business practices inside out.",`Tone: ${d}. Be direct, helpful, and specific. Avoid corporate waffle.`,`Today's date: ${u} (Australia/Brisbane time).`,"","## ACTIVE CONTEXT",`Company: ${s.companyName}`,`Industry: ${s.industry??"construction"}`,`User: ${s.user.name} (${s.user.role})`,`Work module terminology: this company calls their main work records "${s.workLabelPlural}" (singular: "${s.workLabelSingular}").`,`  - Always use "${s.workLabelPlural}" / "${s.workLabelSingular}" when referring to work records in your answers.`,'  - If the user asks about "jobs", "projects", "sites", "stations", "stores", or "work orders", treat them as the same thing.',s.supportMode?`⚠️ SUPPORT MODE ACTIVE — answering from company: ${s.companyName} (ID: ${s.supportCompanyId}). Do NOT blend data from any other company.`:"Normal mode — answering from user's own company only.","","## STRUCTURED ANSWER FORMAT — MANDATORY","","Every answer MUST use the following section labels, in this order.",'Omit a section only if it genuinely does not apply — NEVER omit "📦 Source modules:" or "📊 Confidence:".',"","📋 From IWILLBUILD data:","  Use when the answer draws on portal data (jobs, fleet, forms, estimates, files, to-dos, prestarts, costs, delays).","  Start with this section if portal data is available. NEVER invent data — only use what is provided below.","  If a module has data but the specific record doesn't exist, say so clearly here.","","🧠 AI reasoning:","  Use for general guidance, calculations, industry knowledge, or reasoning not from portal data.","  Label clearly so the user knows this is not portal data.","  For WHS/code matters, always add the verification reminder here.","","📦 Source modules:","  ALWAYS include. List every module whose data was used.","  Exact module names: Jobs, Fleet, Forms, Estimates, Files, To-do, Progress, Safety, Storage, Billing, Company Knowledge",'  If no portal data used: "No portal data used — AI reasoning only."','  If a module was empty: e.g. "Fleet (no records yet)"',"","📊 Confidence:","  ALWAYS include. Rate as: High / Medium / Low","  High = directly from portal data, no ambiguity","  Medium = mixes portal data with AI reasoning, or data is partial","  Low = mostly AI reasoning with little portal data, or data is stale/incomplete","  If Low, briefly explain why.","","💡 Suggested next action:","  Include when there is a clear, useful next step in IWILLBUILD.","  One sentence. Omit if no obvious next action.","","⚠️ Verification reminder:","  Include when the answer involves safety, compliance, WHS, legal, building codes, financial decisions, or medical matters.",'  Always add: "Please verify against current legislation, project documents, and a competent person."',"  Omit for simple calculations, general wording help, or non-compliance questions.","","## ANSWER PRIORITY — FOLLOW THIS ORDER EXACTLY","","### 1. Simple / local questions — answer immediately","- Basic arithmetic, GST, percentages, areas, volumes, falls, perimeters → calculate and answer","- Spelling, grammar, wording help → answer directly",`- General industry knowledge for a ${s.industry??"construction"} company → answer directly`,'- Still include "📦 Source modules:" and "📊 Confidence:" even for simple answers.',"","### 2. IWILLBUILD portal data — use the data sections below","- Jobs, fleet, forms, estimates, files, to-dos, prestarts → use the data provided below",'- Put portal data findings in "📋 From IWILLBUILD data:" section',`- NEVER say "I don't have enough data" when the data IS provided below — use it.`,"","### 3. General guidance — use your construction industry knowledge",'- For questions not covered by local tools or portal data, provide expert guidance in "🧠 AI reasoning:" section',"","## CONSTRUCTION CALCULATOR LIBRARY","Use these formulas when asked. Always show working.","","**GST (Australia, 10%):**","  Add GST: Total = Base × 1.1 | GST amount = Base × 0.1","  Remove GST: Base = Total ÷ 1.1 | GST amount = Total − Base","","**Concrete volume:**","  Volume (m³) = Length × Width × Depth (all in metres)","  Add 10% waste. Round up to nearest 0.5 m³ for ordering.","  Standard slab depths: 100mm (residential), 150mm (commercial), 200mm (heavy duty)","","**Brickwork:**","  Standard brick: 230mm × 110mm × 76mm","  Bricks per m² (single skin): ~50 bricks/m²","  Mortar: 1 bag cement per 50 bricks (approx)","","**Roof pitch / rafter length:**","  Rafter = Span ÷ 2 ÷ cos(pitch angle)","  Common pitches: 15°, 22.5°, 30°, 35°","","**Pipe / drain fall:**","  Fall (mm) = Length (m) × 1000 ÷ Ratio","  e.g. 10m at 1:100 = 100mm fall","  Min fall for sewer: 1:60 (residential), 1:40 (commercial)","","**Markup vs margin:**","  Markup: Sell = Cost × (1 + markup%)","  Margin: Sell = Cost ÷ (1 − margin%)","  e.g. 20% markup on $10,000 = $12,000 sell | 20% margin on $10,000 cost = $12,500 sell","","**Labour hours:**","  Total cost = Hours × Rate (ex GST)","  Standard working day: 8 hours | Week: 38 hours (award) or 40 hours (site)","","**Earthworks / excavation:**","  Volume (m³) = Length × Width × Depth","  Swell factor: clay 25–30%, sand 10–15%, rock 30–40%","  Truck loads = Volume × swell factor ÷ truck capacity (typically 10–12 m³)","",`## WHEN TO SAY "I don't have enough data"`,"ONLY when ALL of the following are true:","- The question requires portal data (not a calculation or general question)","- The relevant module has no records in the data sections below","- The user has permission to see that module","Otherwise, answer using the data provided.","","## CRITICAL GUARDRAILS","","### Company boundary",`1. You ONLY have data for ONE company: "${s.companyName}".`,"2. NEVER use, reference, compare, or reveal data from any other company.",`3. If asked about another company's data: "I can't access another company's private IWILLBUILD data."`,"","### Data integrity","4. NEVER invent jobs, fleet assets, estimates, forms, files, or users. Only use data provided below.","5. If OpenAI knowledge conflicts with IWILLBUILD portal data, ALWAYS prefer portal data and flag the conflict.","","### Permission enforcement",`6. canJobs: ${a.canJobs} — if false, refuse all job questions: "You don't have Jobs access."`,`7. canFleet: ${a.canFleet} — if false, refuse all fleet questions: "You don't have Fleet access."`,`8. canForms: ${a.canForms} — if false, refuse all forms questions: "You don't have Forms access."`,`9. canEstimating: ${a.canEstimating} — if false, refuse all estimate/quote questions: "You don't have Estimating access."`,`10. canFiles: ${a.canFiles} — if false, refuse all file questions: "You don't have Files access."`,"","### Dollar / financial data",`11. seeDollars: ${a.seeDollars}`,"    If seeDollars is FALSE, NEVER show or mention dollar amounts, rates, totals, or margins.",`    If asked: "I can't show cost values with your current permissions."`,"","### Quote / estimate questions",'12. For "how much did we quote for this job?" — only answer if canJobs AND canEstimating AND seeDollars are ALL true.',"","### Estimating guidance",`13. For "how much to build this job?" — help using the calculator library and this company's cost guide.`,'    Always include: "This is guidance only. Verify rates, scope, site conditions and margins before quoting."',"","### Safety and compliance","14. NEVER claim legal, WHS, or building code certainty.",'15. For WHS/code matters, always include a "⚠️ Verification reminder:" section.','16. For SWMS, always note: "Review with a competent person before signing off on site."',"","### Read-only","17. You are a read-only assistant. You can summarise, analyse, and recommend — but you cannot create, edit, delete, or sync records.","    If asked to do so, explain that the user should use the relevant module in IWILLBUILD.",""];c.enabled&&(c.companyNotes&&(r.push("## COMPANY KNOWLEDGE"),r.push(c.companyNotes),r.push("")),c.safetyNotes&&(r.push("## SAFETY & PROCESS NOTES"),r.push(c.safetyNotes),r.push("")));const f=s.knowledgeEntries??[];if(f.length>0){r.push(`## COMPANY KNOWLEDGE BASE — ${s.companyName} only — ${f.length} active entries`),r.push('IMPORTANT: When using any of these entries in your answer, prefix with "From company knowledge:".'),r.push('For NCC, WHS, or building code entries, always add: "Please verify against the current official standard or a competent person."'),r.push("NEVER treat these entries as legal certainty."),r.push("");const h={};for(const v of f)h[v.category]||(h[v.category]=[]),h[v.category].push(v);for(const[v,y]of Object.entries(h)){r.push(`### ${v}`);for(const I of y)r.push(`**${I.title}**${I.source_name?` (Source: ${I.source_name})`:""}`),r.push(I.content),r.push("")}}if(a.canJobs){const h=((g=s.jobs)==null?void 0:g.length)??0;r.push(`## JOBS DATA — ${s.companyName} only (Source: Jobs) — ${h} job(s)`),h===0?r.push("No jobs found for this company yet."):r.push(JSON.stringify(s.jobs,null,0)),r.push(""),(p=s.openTodos)!=null&&p.length?(r.push(`## OPEN TO-DOS — ${s.companyName} only (Source: Jobs) — ${s.openTodos.length} open`),r.push(JSON.stringify(s.openTodos,null,0)),r.push("")):(r.push("## OPEN TO-DOS — 0 open to-dos"),r.push("")),($=s.jobProgress)!=null&&$.length&&(r.push(`## JOB PROGRESS — ${s.companyName} only (Source: Jobs)`),r.push(JSON.stringify(s.jobProgress,null,0)),r.push("")),(S=s.jobCosts)!=null&&S.length&&(r.push(`## JOB COSTS — ${s.companyName} only (Source: Cost Tracker) — ${s.jobCosts.length} job(s) with costs`),r.push("Fields: job_id, job_name, job_number, total_actual, total_gst, total_ex_gst, entry_count, approved_estimate"),r.push("Use this to answer: what has a job cost, which jobs are over budget, profit/margin per job, total spend."),r.push(JSON.stringify(s.jobCosts,null,0)),r.push("")),(e=s.jobDelays)!=null&&e.length&&(r.push(`## JOB DELAYS — ${s.companyName} only (Source: Delays) — ${s.jobDelays.length} job(s) with delays`),r.push("Fields: job_id, job_name, job_number, total_delay_days, delay_count"),r.push("Use this to answer: how many delay days does a job have, which jobs have the most delays, total delay days across all jobs."),r.push(JSON.stringify(s.jobDelays,null,0)),r.push(""))}if(a.canFleet){const h=((t=s.fleet)==null?void 0:t.length)??0;r.push(`## FLEET DATA — ${s.companyName} only (Source: Fleet) — ${h} asset(s)`),h===0?r.push("No fleet assets found for this company yet."):r.push(JSON.stringify(s.fleet,null,0)),r.push("");const v=((o=s.prestarts)==null?void 0:o.length)??0;r.push(`## FLEET PRESTARTS — ${s.companyName} only (Source: Fleet) — ${v} prestart(s) loaded`),v===0?r.push("No completed prestarts found yet. If fleet assets exist, prestarts may not have been submitted yet."):r.push(JSON.stringify(s.prestarts,null,0)),r.push(""),(n=s.fleetFlags)!=null&&n.length?(r.push(`## FLEET ATTENTION FLAGS — ${s.companyName} only (Source: Fleet) — ${s.fleetFlags.length} flag(s)`),r.push(JSON.stringify(s.fleetFlags,null,0)),r.push("")):(r.push("## FLEET ATTENTION FLAGS — 0 flags"),r.push("")),(i=s.fleetDueDates)!=null&&i.length?(r.push(`## FLEET DUE DATES (next 14 days) — ${s.companyName} only (Source: Fleet)`),r.push(JSON.stringify(s.fleetDueDates,null,0)),r.push("")):(l=s.fleet)!=null&&l.length&&(r.push(`## ALL FLEET SERVICE & REGO DATES — ${s.companyName} only (Source: Fleet)`),r.push("Note: No assets are due within 14 days, but here are all service/rego dates:"),r.push(JSON.stringify(s.fleet.map(N=>({name:N.name,service_date:N.service_date,rego_expiry:N.rego_expiry,rego_not_applicable:N.rego_not_applicable})),null,0)),r.push(""));const y=s.activeDriverSessions??[],I=s.recentDriverSessions??[];r.push(`## ACTIVE DRIVER SESSIONS — ${s.companyName} — ${y.length} active`),y.length===0?r.push("No vehicles are currently being driven."):r.push(JSON.stringify(y,null,0)),r.push(""),I.length>0&&(r.push(`## RECENT DRIVER SESSIONS (last 50) — ${s.companyName} — use to answer who drove what and when`),r.push(JSON.stringify(I,null,0)),r.push(""))}if(a.canEstimating){const h=((m=s.estimates)==null?void 0:m.length)??0;r.push(`## ESTIMATES DATA — ${s.companyName} only (Source: Estimates) — ${h} estimate(s)`),h===0?r.push("No estimates found for this company yet."):(a.seeDollars||r.push("NOTE: Dollar amounts have been stripped from this data. Do NOT mention any rates or totals."),r.push(JSON.stringify(s.estimates,null,0))),r.push("")}if(a.canForms){const h=((b=s.formTemplates)==null?void 0:b.length)??0,v=((L=s.formSubmissions)==null?void 0:L.length)??0;r.push(`## FORM TEMPLATES — ${s.companyName} only (Source: Forms) — ${h} template(s)`),h===0?r.push("No form templates found yet."):r.push(JSON.stringify(s.formTemplates,null,0)),r.push(""),r.push(`## FORM SUBMISSIONS — ${s.companyName} only (Source: Forms) — ${v} submission(s)`),v===0?r.push("No form submissions found yet."):r.push(JSON.stringify(s.formSubmissions,null,0)),r.push("")}if(a.canFiles){const h=((F=s.files)==null?void 0:F.length)??0;r.push(`## FILES — ${s.companyName} only (Source: Files) — ${h} file(s)`),h===0?r.push("No files found yet."):r.push(JSON.stringify(s.files,null,0)),r.push("")}return c.disclaimer&&(r.push("## DISCLAIMER — include in relevant responses"),r.push(c.disclaimer),r.push("")),r.join(`
`)}async function ze(s,a){var c,d;try{const u=U(),r=new Headers;for(const[y,I]of Object.entries(s.headers))I&&r.set(y,Array.isArray(I)?I[0]:I);const f=await u.api.getSession({headers:r});if(!(f!=null&&f.user))return a.status(401).json({error:"Unauthorised"});const g=await _.query.profiles.findFirst({where:M(k.userId,f.user.id)});if(!(g!=null&&g.companyId))return a.status(403).json({error:"No company"});const p=E(g);if(!p.canDazzaAi)return a.status(403).json({error:"Dazza AI access not permitted for your role."});if(!p.isOwner)return a.status(403).json({error:"System AI is restricted to the platform owner."});const{messages:$,supportCompanyId:S}=s.body;if(!$||!Array.isArray($))return a.status(400).json({error:"messages required"});const e=((c=[...$].reverse().find(y=>y.role==="user"))==null?void 0:c.content)??"",t=await T(g.companyId),o=!p.isOwner&&(t==="trial_expired"||t==="cancelled"||t==="suspended"),n=q(e);if(n){const y=V(n,e),I=C(y,e);return D({companyId:g.companyId,userId:f.user.id,userName:f.user.name??f.user.email??"Unknown",eventType:"dazza_chat",modulesAccessed:[],dollarsIncluded:!1,supportMode:!1,questionSummary:e,metadata:{source:"local_tool"}}),a.json({reply:I,localTool:!0,source:"local_tool",tokens:0})}const{supportCompanyId:i}=await A(p.isOwner,g.companyId,S??null);let l=await W(f.user.id,f.user.email,f.user.name,g.role??"worker",g.companyId,p,i);l=B(l);const m=R({question:e,permissions:p,companyName:l.companyName,isViewOnly:o,isOwner:p.isOwner,subscriptionStatus:t});if(m.blocked&&m.refusal)return D({companyId:g.companyId,userId:f.user.id,userName:f.user.name??f.user.email??"Unknown",eventType:"dazza_refusal",modulesAccessed:[],dollarsIncluded:!1,supportMode:l.supportMode,supportCompanyId:l.supportCompanyId,questionSummary:e,refusalReason:m.refusal.reason}),a.json({reply:m.refusal.message,localTool:!0,source:"portal_data",tokens:0,wallRefusal:m.refusal.reason});if((d=m.mutationDetected)!=null&&d.requiresConfirmation){const y=m.mutationDetected.action??"unknown",I=K(y,l.companyName);return D({companyId:g.companyId,userId:f.user.id,userName:f.user.name??f.user.email??"Unknown",eventType:"dazza_action_request",modulesAccessed:[],dollarsIncluded:!1,supportMode:l.supportMode,supportCompanyId:l.supportCompanyId,questionSummary:e,actionType:y}),a.json({reply:I,localTool:!0,source:"portal_data",tokens:0,mutationDetected:y,requiresConfirmation:!0})}const b=P(e,l);if(/another company|other company|different company|competitor|someone elses?\s+(?:quote|job|data|estimate)/i.test(e)){const y=z(l.companyName);return a.json({reply:y,localTool:!0,source:"portal_data",tokens:0,supportMode:l.supportMode,supportCompanyName:l.supportMode?l.companyName:void 0})}const L=await O(e,l,$,b,b!==null?"portal_data":null),F=L.modulesUsed??[];let h=H(L.reply,F);h=J(h),h=C(h,e),D({companyId:g.companyId,userId:f.user.id,userName:f.user.name??f.user.email??"Unknown",eventType:"dazza_chat",modulesAccessed:F,dollarsIncluded:p.seeDollars&&/\$|dollar|cost|total|rate|margin/i.test(e),supportMode:l.supportMode,supportCompanyId:l.supportCompanyId,questionSummary:e,metadata:{source:L.source,tokens:L.tokens??0}});const v=p.isAdmin?G(l):void 0;a.json({reply:h,tokens:L.tokens??0,source:L.source,noApiKey:L.source==="no_key",confidence:L.confidence,modulesUsed:F,conflictDetected:L.conflictDetected,hiveCandidate:L.hiveCandidate,localTool:L.localTool,contextDebug:v,supportMode:l.supportMode,supportCompanyName:l.supportMode?l.companyName:void 0})}catch(u){const r=String((u==null?void 0:u.message)??u);console.error("POST /api/dazza/chat CRASH:",r,u),a.status(500).json({error:"Failed to process chat",detail:r})}}function V(s,a){const c=/whs|safety|compliance|legal|code|regulation/i.test(a),d=[];return d.push(`🧠 AI reasoning:
${s}`),d.push(`📦 Source modules:
No portal data used — local calculator only.`),d.push(`📊 Confidence:
High — direct calculation, no estimation.`),c&&d.push(`⚠️ Verification reminder:
Please verify against current legislation, project documents, and a competent person.`),d.join(`

`)}function z(s){return[`📋 From IWILLBUILD data:
I can only access data for **${s}**. I cannot access, compare, or reveal data from any other company.`,`📦 Source modules:
No portal data used — security guard triggered.`,`📊 Confidence:
High — this is a security boundary, not a data question.`].join(`

`)}function K(s,a){return[`🧠 AI reasoning:
I can help you **${s.replace(/_/g," ")}** for **${a}**, but I need your explicit confirmation before making any changes.`,"To proceed, please go to the relevant module in IWILLBUILD and confirm the action there. Dazza is a read-only assistant — all changes must be confirmed through the portal interface.",`📦 Source modules:
No portal data used — action safety boundary.`,`📊 Confidence:
High — this is a safety boundary to prevent unintended changes.`,`💡 Suggested next action:
Navigate to the relevant module in IWILLBUILD to complete this action with full confirmation.`].join(`

`)}export{Ve as buildSystemPrompt,ze as default};
