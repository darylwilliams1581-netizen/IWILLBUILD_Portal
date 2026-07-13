import{createRequire as F}from"module";import{d,g as M,p as k,a as W,w as P,bd as H,c as B,r as Y,l as U,k as J}from"../server.bundle.mjs";import{s as l,j as q}from"./drizzle-CZ2vWAZ3.js";import"./express-C3pMhyZZ.js";import"tty";import"os";import"util";import"path";import"./iconv-DatUeE_T.js";import"buffer";import"string_decoder";import"node:zlib";import"./es-abstract-B57Whf45.js";import"url";import"node:fs";import"node:path";import"fs";import"crypto";import"node:http";import"node:buffer";import"node:querystring";import"node:net";import"stream";import"node:events";import"./radix-ui-C6rnOgg1.js";import"./react-router-CkzSIMgX.js";import"./react-dom-CZsMFu04.js";import"async_hooks";import"node:url";import"./mysql2-HVwznT_d.js";import"net";import"events";import"process";import"timers";import"tls";import"zlib";import"node:process";import"./better-auth-B2r-Xofv.js";import"./kysely-9kO2vj_T.js";import"node:crypto";import"./noble-DY0vnRA-.js";import"node:fs/promises";import"node:os";import"./multer-CH1RChRJ.js";import"fs/promises";import"./jszip-DFkTEOyz.js";import"node:util";import"http";import"https";import"assert";const Z=F(import.meta.url);async function p(t,e,g,s,c){try{const h=await e();return c[t]=Array.isArray(h)?h.length:1,h}catch(h){const f=String((h==null?void 0:h.message)??h);return console.warn(`[annette-context] ${t} FAILED: ${f}`),s.push(`${t}: ${f.slice(0,120)}`),c[t]=-1,g}}function G(t,e){const g=new Date(t);return Math.round((e.getTime()-g.getTime())/864e5)}async function X(t,e,g){const s=new Date,c=s.toISOString().slice(0,10),h=new Date(s.getTime()+14*864e5).toISOString().slice(0,10),f=new Date(s.getTime()-14*864e5).toISOString().slice(0,10),i=[],r={},n={companyName:g,companyId:t,runAt:s.toISOString(),seeDollars:e.seeDollars,warnings:i,moduleCounts:r,jobs:{total:0,byStatus:{},noForms:[],approvedNoProgress:[],noPhotos:[],noFiles:[],stalled:[]},todos:{overdueCount:0,dueTodayCount:0,overdue:[],dueToday:[]},fleet:{total:0,serviceOverdue:[],regoOverdue:[],serviceDue14:[],regoDue14:[],openFlags:[],noPrestartDays:null},estimates:{draftTooLong:[],pendingApproval:[]},forms:{incompleteSubmissions:[],jobsWithNoForms:0},shareLinks:{total:0,expired:[],maxed:[]}};return e.canJobs&&(await p("jobs_summary",async()=>{const[o]=await d.execute(l`SELECT status, COUNT(*) as cnt FROM jobs
            WHERE company_id = ${t} GROUP BY status`);let a=0;for(const u of o??[])n.jobs.byStatus[u.status]=Number(u.cnt),a+=Number(u.cnt);return n.jobs.total=a,o},[],i,r),await p("jobs_no_forms",async()=>{const[o]=await d.execute(l`SELECT j.id, j.job_number, j.name, j.status
            FROM jobs j
            WHERE j.company_id = ${t}
              AND j.status NOT IN ('Completed','Cancelled','Archived')
              AND NOT EXISTS (
                SELECT 1 FROM job_form_submissions jfs WHERE jfs.job_id = j.id
              )
            ORDER BY j.created_at DESC LIMIT 20`);return n.jobs.noForms=o??[],n.forms.jobsWithNoForms=(o??[]).length,o},[],i,r),await p("jobs_approved_no_progress",async()=>{const[o]=await d.execute(l`SELECT j.id, j.job_number, j.name
            FROM jobs j
            WHERE j.company_id = ${t}
              AND j.status = 'Approved'
              AND NOT EXISTS (
                SELECT 1 FROM job_progress_lines p WHERE p.job_id = j.id
              )
            ORDER BY j.created_at DESC LIMIT 20`);return n.jobs.approvedNoProgress=o??[],o},[],i,r),await p("jobs_no_photos",async()=>{const[o]=await d.execute(l`SELECT j.id, j.job_number, j.name, j.status
            FROM jobs j
            WHERE j.company_id = ${t}
              AND j.status NOT IN ('Completed','Cancelled','Archived')
              AND NOT EXISTS (
                SELECT 1 FROM job_photos p WHERE p.job_id = j.id
              )
            ORDER BY j.created_at DESC LIMIT 20`);return n.jobs.noPhotos=o??[],o},[],i,r),await p("jobs_no_files",async()=>{const[o]=await d.execute(l`SELECT j.id, j.job_number, j.name, j.status
            FROM jobs j
            WHERE j.company_id = ${t}
              AND j.status NOT IN ('Completed','Cancelled','Archived')
              AND NOT EXISTS (
                SELECT 1 FROM company_files cf WHERE cf.job_id = j.id
              )
            ORDER BY j.created_at DESC LIMIT 20`);return n.jobs.noFiles=o??[],o},[],i,r),await p("jobs_stalled",async()=>{const[o]=await d.execute(l`SELECT j.id, j.job_number, j.name, j.status,
                   DATEDIFF(NOW(), j.updated_at) as days_since_update
            FROM jobs j
            WHERE j.company_id = ${t}
              AND j.status IN ('Active','In Progress','Approved')
              AND j.updated_at < ${f}
            ORDER BY j.updated_at ASC LIMIT 15`);return n.jobs.stalled=(o??[]).map(a=>({...a,days_since_update:Number(a.days_since_update)})),o},[],i,r)),e.canJobs&&(await p("todos_overdue",async()=>{const[o]=await d.execute(l`SELECT t.id, t.title, j.name as job_name, t.due_date,
                   DATEDIFF(NOW(), t.due_date) as days_overdue
            FROM job_todos t
            JOIN jobs j ON j.id = t.job_id
            WHERE j.company_id = ${t}
              AND t.status = 'Open'
              AND t.due_date < ${c}
            ORDER BY t.due_date ASC LIMIT 30`);return n.todos.overdue=(o??[]).map(a=>({...a,days_overdue:Number(a.days_overdue)})),n.todos.overdueCount=n.todos.overdue.length,o},[],i,r),await p("todos_today",async()=>{const[o]=await d.execute(l`SELECT t.id, t.title, j.name as job_name, t.due_date
            FROM job_todos t
            JOIN jobs j ON j.id = t.job_id
            WHERE j.company_id = ${t}
              AND t.status = 'Open'
              AND t.due_date = ${c}
            ORDER BY t.title ASC LIMIT 20`);return n.todos.dueToday=o??[],n.todos.dueTodayCount=n.todos.dueToday.length,o},[],i,r)),e.canFleet&&(await p("fleet_total",async()=>{var a;const[o]=await d.execute(l`SELECT COUNT(*) as cnt FROM fleet_assets
            WHERE company_id = ${t} AND archived = 0`);return n.fleet.total=Number(((a=o==null?void 0:o[0])==null?void 0:a.cnt)??0),o},[],i,r),await p("fleet_service_overdue",async()=>{const[o]=await d.execute(l`SELECT id, name, rego, DATE(service_date) as service_date,
                   DATEDIFF(NOW(), service_date) as days_overdue
            FROM fleet_assets
            WHERE company_id = ${t} AND archived = 0
              AND service_date IS NOT NULL AND DATE(service_date) < ${c}
            ORDER BY service_date ASC LIMIT 20`);return n.fleet.serviceOverdue=(o??[]).map(a=>({...a,days_overdue:Number(a.days_overdue)})),o},[],i,r),await p("fleet_rego_overdue",async()=>{const[o]=await d.execute(l`SELECT id, name, rego, DATE(rego_expiry) as rego_expiry,
                   DATEDIFF(NOW(), rego_expiry) as days_overdue
            FROM fleet_assets
            WHERE company_id = ${t} AND archived = 0
              AND rego_not_applicable = 0
              AND rego_expiry IS NOT NULL AND DATE(rego_expiry) < ${c}
            ORDER BY rego_expiry ASC LIMIT 20`);return n.fleet.regoOverdue=(o??[]).map(a=>({...a,days_overdue:Number(a.days_overdue)})),o},[],i,r),await p("fleet_service_due14",async()=>{const[o]=await d.execute(l`SELECT id, name, rego, DATE(service_date) as service_date,
                   DATEDIFF(service_date, NOW()) as days_until
            FROM fleet_assets
            WHERE company_id = ${t} AND archived = 0
              AND service_date IS NOT NULL
              AND DATE(service_date) >= ${c} AND DATE(service_date) <= ${h}
            ORDER BY service_date ASC LIMIT 20`);return n.fleet.serviceDue14=(o??[]).map(a=>({...a,days_until:Number(a.days_until)})),o},[],i,r),await p("fleet_rego_due14",async()=>{const[o]=await d.execute(l`SELECT id, name, rego, DATE(rego_expiry) as rego_expiry,
                   DATEDIFF(rego_expiry, NOW()) as days_until
            FROM fleet_assets
            WHERE company_id = ${t} AND archived = 0
              AND rego_not_applicable = 0
              AND rego_expiry IS NOT NULL
              AND DATE(rego_expiry) >= ${c} AND DATE(rego_expiry) <= ${h}
            ORDER BY rego_expiry ASC LIMIT 20`);return n.fleet.regoDue14=(o??[]).map(a=>({...a,days_until:Number(a.days_until)})),o},[],i,r),await p("fleet_flags",async()=>{const[o]=await d.execute(l`SELECT fa.name as asset_name, fp.issue_comment, fp.created_at as flagged_at
            FROM fleet_prestarts fp
            JOIN fleet_assets fa ON fa.id = fp.asset_id
            WHERE fp.company_id = ${t}
              AND fp.issue_needs_attention = 1
            ORDER BY fp.created_at DESC LIMIT 20`);return n.fleet.openFlags=o??[],o},[],i,r),await p("fleet_last_prestart",async()=>{var u;const[o]=await d.execute(l`SELECT MAX(created_at) as last_at FROM fleet_prestarts
            WHERE company_id = ${t}`),a=(u=o==null?void 0:o[0])==null?void 0:u.last_at;return n.fleet.noPrestartDays=a?G(a,s):999,o},[],i,r)),e.canEstimating&&(await p("estimates_draft_long",async()=>{const[o]=await d.execute(l`SELECT e.id, j.name as job_name, e.title,
                   DATEDIFF(NOW(), e.created_at) as days_in_draft,
                   COALESCE(SUM(CAST(el.quantity AS DECIMAL(10,2)) * CAST(el.rate AS DECIMAL(10,2))), 0) as amount
            FROM estimates e
            JOIN jobs j ON j.id = e.job_id
            LEFT JOIN estimate_lines el ON el.estimate_id = e.id
            WHERE j.company_id = ${t}
              AND e.status = 'Draft'
              AND e.created_at < ${f}
            GROUP BY e.id, j.name, e.title, e.created_at
            ORDER BY e.created_at ASC LIMIT 15`);return n.estimates.draftTooLong=(o??[]).map(a=>({...a,days_in_draft:Number(a.days_in_draft),amount:e.seeDollars?Number(a.amount):void 0})),o},[],i,r),await p("estimates_pending",async()=>{const[o]=await d.execute(l`SELECT e.id, j.name as job_name, e.title,
                   DATEDIFF(NOW(), e.updated_at) as days_pending,
                   COALESCE(SUM(CAST(el.quantity AS DECIMAL(10,2)) * CAST(el.rate AS DECIMAL(10,2))), 0) as amount
            FROM estimates e
            JOIN jobs j ON j.id = e.job_id
            LEFT JOIN estimate_lines el ON el.estimate_id = e.id
            WHERE j.company_id = ${t}
              AND e.status = 'Pending Approval'
            GROUP BY e.id, j.name, e.title, e.updated_at
            ORDER BY e.updated_at ASC LIMIT 15`);return n.estimates.pendingApproval=(o??[]).map(a=>({...a,days_pending:Number(a.days_pending),amount:e.seeDollars?Number(a.amount):void 0})),o},[],i,r)),e.canForms&&await p("forms_incomplete",async()=>{const[o]=await d.execute(l`SELECT ft.name as form_name, j.name as job_name, jfs.created_at as submitted_at
            FROM job_form_submissions jfs
            JOIN form_templates ft ON ft.id = jfs.template_id
            JOIN jobs j ON j.id = jfs.job_id
            WHERE j.company_id = ${t}
              AND jfs.status = 'in_progress'
            ORDER BY jfs.created_at DESC LIMIT 20`);return n.forms.incompleteSubmissions=o??[],o},[],i,r),await p("share_links_hygiene",async()=>{const[o]=await d.execute(l`SELECT id, title, target_type, target_id, expires_at, max_uses, use_count, revoked
          FROM secure_share_links
          WHERE company_id = ${t} AND revoked = 0
          ORDER BY created_at DESC LIMIT 100`),a=o??[];return n.shareLinks.total=a.length,n.shareLinks.expired=a.filter(u=>u.expires_at&&new Date(u.expires_at)<s).map(u=>({id:u.id,title:u.title,target_type:u.target_type,target_id:u.target_id,expires_at:u.expires_at})),n.shareLinks.maxed=a.filter(u=>u.max_uses!==null&&u.use_count>=u.max_uses).map(u=>({id:u.id,title:u.title,target_type:u.target_type,target_id:u.target_id,use_count:u.use_count,max_uses:u.max_uses})),o},[],i,r),n}function z(t){const e=[],g=new Date(t.runAt).toLocaleDateString("en-AU",{weekday:"long",day:"numeric",month:"long",year:"numeric",timeZone:"Australia/Brisbane"});if(e.push(`You are Annette — the IWILLBUILD health-check assistant for ${t.companyName}.`),e.push("You're a switched-on, no-nonsense Aussie construction business analyst."),e.push(`You've just run a full scan of ${t.companyName}'s portal data and you're about to give them the straight guts of it.`),e.push(`Today: ${g} (Brisbane time)`),e.push(""),e.push("## YOUR STYLE"),e.push("- Direct, practical, plain Australian English. No corporate waffle."),e.push("- Lead with the most urgent stuff first — don't bury the critical items."),e.push('- Use "you" and "your" — talk to the business owner directly.'),e.push("- Short, punchy sentences. Bullet points where possible."),e.push("- If something's a real problem, say so clearly. Don't soften it."),e.push(`- If everything's fine in a section, say "All good here." — don't pad it out.`),e.push(""),e.push("## CRITICAL RULES (non-negotiable — walls stay up)"),e.push("1. NEVER invent, guess, or fabricate data. Only report what is in the data below."),e.push("2. Always cite the source module (Source: Jobs / Source: Fleet / etc.)."),e.push("3. Clearly separate FACTS (from data) from SUGGESTIONS (your recommendations)."),e.push('4. For any WHS, building code, or legal compliance item, add: "⚠️ Verify with a competent person or current official standard."'),e.push(`5. ${t.seeDollars?"Dollar amounts are included where available.":"Do NOT show dollar amounts — this user does not have the See Dollars permission."}`),e.push(`6. NEVER expose data from any other company. This report is for ${t.companyName} only.`),e.push("7. You are READ-ONLY. You can identify issues and recommend fixes — you cannot create, edit, delete, or sync records."),e.push(""),e.push("=== ANALYSIS DATA ==="),e.push(""),e.push("## JOBS (Source: Jobs)"),e.push(`Total jobs: ${t.jobs.total}`),Object.keys(t.jobs.byStatus).length&&e.push(`By status: ${Object.entries(t.jobs.byStatus).map(([s,c])=>`${s}: ${c}`).join(", ")}`),t.jobs.stalled.length){e.push(`Stalled active jobs (no update in 14+ days): ${t.jobs.stalled.length}`);for(const s of t.jobs.stalled)e.push(`  - ${s.job_number} "${s.name}" [${s.status}] — ${s.days_since_update} days since last update`)}if(t.jobs.approvedNoProgress.length){e.push(`Approved jobs with no progress tracking: ${t.jobs.approvedNoProgress.length}`);for(const s of t.jobs.approvedNoProgress)e.push(`  - ${s.job_number} "${s.name}"`)}if(t.jobs.noForms.length){e.push(`Active jobs with no form submissions: ${t.jobs.noForms.length}`);for(const s of t.jobs.noForms.slice(0,10))e.push(`  - ${s.job_number} "${s.name}" [${s.status}]`)}if(t.jobs.noPhotos.length){e.push(`Active jobs with no photos: ${t.jobs.noPhotos.length}`);for(const s of t.jobs.noPhotos.slice(0,10))e.push(`  - ${s.job_number} "${s.name}" [${s.status}]`)}if(t.jobs.noFiles.length){e.push(`Active jobs with no files: ${t.jobs.noFiles.length}`);for(const s of t.jobs.noFiles.slice(0,10))e.push(`  - ${s.job_number} "${s.name}" [${s.status}]`)}if(e.push(""),e.push("## TO-DOS (Source: Jobs)"),e.push(`Overdue: ${t.todos.overdueCount} | Due today: ${t.todos.dueTodayCount}`),t.todos.overdue.length){e.push("Overdue items:");for(const s of t.todos.overdue.slice(0,15))e.push(`  - "${s.title}" on job "${s.job_name}" — ${s.days_overdue} days overdue (due ${s.due_date})`)}if(t.todos.dueToday.length){e.push("Due today:");for(const s of t.todos.dueToday)e.push(`  - "${s.title}" on job "${s.job_name}"`)}if(e.push(""),e.push("## FLEET (Source: Fleet)"),e.push(`Total assets: ${t.fleet.total}`),t.fleet.serviceOverdue.length){e.push(`Service OVERDUE: ${t.fleet.serviceOverdue.length}`);for(const s of t.fleet.serviceOverdue)e.push(`  - ${s.name}${s.rego?` (${s.rego})`:""} — service was due ${s.service_date} (${s.days_overdue} days ago)`)}if(t.fleet.regoOverdue.length){e.push(`Rego EXPIRED: ${t.fleet.regoOverdue.length}`);for(const s of t.fleet.regoOverdue)e.push(`  - ${s.name}${s.rego?` (${s.rego})`:""} — expired ${s.rego_expiry} (${s.days_overdue} days ago) ⚠️ Do not operate on public roads.`)}if(t.fleet.serviceDue14.length){e.push(`Service due within 14 days: ${t.fleet.serviceDue14.length}`);for(const s of t.fleet.serviceDue14)e.push(`  - ${s.name} — due ${s.service_date} (in ${s.days_until} days)`)}if(t.fleet.regoDue14.length){e.push(`Rego expiring within 14 days: ${t.fleet.regoDue14.length}`);for(const s of t.fleet.regoDue14)e.push(`  - ${s.name}${s.rego?` (${s.rego})`:""} — expires ${s.rego_expiry} (in ${s.days_until} days)`)}if(t.fleet.openFlags.length){e.push(`Open prestart flags (issues needing attention): ${t.fleet.openFlags.length}`);for(const s of t.fleet.openFlags)e.push(`  - ${s.asset_name}: "${s.issue_comment}" (flagged ${new Date(s.flagged_at).toLocaleDateString("en-AU")})`)}if(t.fleet.noPrestartDays!==null&&t.fleet.noPrestartDays>=7&&e.push(`Last prestart recorded: ${t.fleet.noPrestartDays>=999?"never (no prestart records found)":`${t.fleet.noPrestartDays} days ago`}`),e.push(""),e.push("## ESTIMATES (Source: Estimates)"),t.estimates.draftTooLong.length){e.push(`Estimates stuck in Draft for 14+ days: ${t.estimates.draftTooLong.length}`);for(const s of t.estimates.draftTooLong){const c=t.seeDollars&&s.amount!=null?` — $${Number(s.amount).toLocaleString("en-AU")}`:"";e.push(`  - "${s.title}" on job "${s.job_name}" — ${s.days_in_draft} days in draft${c}`)}}if(t.estimates.pendingApproval.length){e.push(`Estimates awaiting approval: ${t.estimates.pendingApproval.length}`);for(const s of t.estimates.pendingApproval){const c=t.seeDollars&&s.amount!=null?` — $${Number(s.amount).toLocaleString("en-AU")}`:"";e.push(`  - "${s.title}" on job "${s.job_name}" — ${s.days_pending} days waiting${c}`)}}if(!t.estimates.draftTooLong.length&&!t.estimates.pendingApproval.length&&e.push("No estimate issues found."),e.push(""),e.push("## FORMS (Source: Forms)"),t.forms.incompleteSubmissions.length){e.push(`Incomplete form submissions: ${t.forms.incompleteSubmissions.length}`);for(const s of t.forms.incompleteSubmissions)e.push(`  - "${s.form_name}" on job "${s.job_name}" — started ${new Date(s.submitted_at).toLocaleDateString("en-AU")}`)}else e.push("No incomplete form submissions.");if(e.push(""),e.push("## SECURE SHARE LINKS (Source: Secure Share)"),e.push(`Total active (non-revoked) share links: ${t.shareLinks.total}`),t.shareLinks.expired.length){e.push(`Expired links still on record (not yet revoked): ${t.shareLinks.expired.length}`);for(const s of t.shareLinks.expired.slice(0,10))e.push(`  - "${s.title}" (${s.target_type.replace(/_/g," ")} #${s.target_id}) — expired ${new Date(s.expires_at).toLocaleDateString("en-AU")}`)}else e.push("No expired links on record.");if(t.shareLinks.maxed.length){e.push(`Links that have reached their max-use limit: ${t.shareLinks.maxed.length}`);for(const s of t.shareLinks.maxed.slice(0,10))e.push(`  - "${s.title}" — ${s.use_count}/${s.max_uses} uses`)}if(e.push(""),t.warnings.length){e.push("## DATA WARNINGS (modules that failed to load)");for(const s of t.warnings)e.push(`  - ${s}`);e.push("")}return e.push("=== END OF DATA ==="),e.push(""),e.push("## REPORT FORMAT — FOLLOW THIS EXACTLY"),e.push(""),e.push("**IMPORTANT: Sort findings by priority — Critical/Urgent items FIRST, then Needs Attention, then Info/Missing.**"),e.push("**Never bury a critical finding below minor ones.**"),e.push(""),e.push("## 🔴 Urgent"),e.push("Items requiring immediate action today."),e.push("Includes: overdue rego (⚠️ do not operate on public roads), expired compliance, critical prestart flags, severely overdue to-dos (7+ days), stalled high-value jobs."),e.push("Format each as: • **[Asset/Job name]** — [what's wrong] — [days overdue] — Source: [module]"),e.push(`If none: "Nothing urgent right now — she's looking alright."`),e.push(""),e.push("## 🟠 Needs Attention"),e.push("Items that need action this week but aren't critical yet."),e.push("Includes: service due within 14 days, rego expiring within 14 days, stalled jobs, pending estimates, open prestart flags, to-dos due soon, expired share links that should be cleaned up."),e.push("Format each as: • **[Name]** — [what needs doing] — [timeframe] — Source: [module]"),e.push('If none: "Nothing pressing this week."'),e.push(""),e.push("## 🔵 Missing Information"),e.push("Jobs or records with gaps that could cause problems later."),e.push("Includes: jobs with no forms, no photos, no files, no progress on approved jobs."),e.push("Group by type. Include job numbers. Keep it brief."),e.push('If none: "All records look complete."'),e.push(""),e.push("## ✅ Suggested Next Actions"),e.push("3–7 concrete, prioritised actions — most urgent first."),e.push("Label each as: [FACT-BASED] (from data) or [SUGGESTION] (your recommendation)."),e.push("Be specific — name the job, asset, or form. Don't be vague."),e.push(""),e.push("## 📊 Data Confidence"),e.push("Rate overall data completeness as High / Medium / Low with a one-sentence plain-English explanation."),e.push("List any modules that failed to load (from warnings above)."),e.push(""),e.push("---"),e.push("Be direct and practical. No waffle. If a section has nothing to report, say so clearly — don't skip it."),e.push("Aussie plain English throughout. The business owner is reading this on their phone on a job site."),e.join(`
`)}async function ze(t,e){var g,s,c,h;try{const f=M(),i=new Headers;for(const[m,_]of Object.entries(t.headers))_&&i.set(m,Array.isArray(_)?_[0]:_);const r=await f.api.getSession({headers:i});if(!(r!=null&&r.user))return e.status(401).json({error:"Unauthorised"});const n=await d.query.profiles.findFirst({where:q(k.userId,r.user.id)});if(!(n!=null&&n.companyId))return e.status(403).json({error:"No company"});const o=W(n);if(!o.canDazzaAi)return e.status(403).json({error:"Dazza AI not enabled for your account"});if(!o.isOwner)return e.status(403).json({error:"System AI is restricted to the platform owner."});const a=await P(n.companyId);if(!o.isOwner&&(a==="trial_expired"||a==="cancelled"||a==="suspended"))return e.status(403).json({error:`Your account is in view-only mode (${a??"unknown"}). Annette health checks require an active subscription.`});const{supportCompanyId:V,question:S}=t.body;if(S){const m=H(S);if(m.blocked)return e.status(400).json({error:m.message})}B({companyId:n.companyId,userId:r.user.id,userName:r.user.name??r.user.email??"Unknown",eventType:"annette_run",modulesAccessed:[],dollarsIncluded:o.seeDollars,supportMode:!1,questionSummary:"Annette Protocol health check"});const{supportCompanyId:I}=t.body,{effectiveCompanyId:D}=await Y(o.isOwner,n.companyId,I),[j]=await d.execute(l`SELECT name FROM companies WHERE id = ${D} LIMIT 1`),L=((g=j==null?void 0:j[0])==null?void 0:g.name)??"Your Company";e.setHeader("Content-Type","text/event-stream"),e.setHeader("Cache-Control","no-cache"),e.setHeader("Connection","keep-alive"),e.setHeader("X-Accel-Buffering","no"),e.flushHeaders();let b;try{b=await X(D,o,L)}catch(m){const _=String((m==null?void 0:m.message)??m);console.error("[annette] context build failed:",_),e.write(`data: ${JSON.stringify({text:`⚠️ Failed to load portal data: ${_.slice(0,200)}`})}

`),e.write(`data: ${JSON.stringify({done:!0,error:!0,warnings:[],moduleCounts:{}})}

`),e.end();return}const w=z(b),E=U("OPENAI_API_KEY");if(!E){e.write(`data: ${JSON.stringify({text:"⚠️ OpenAI API key not configured. Portal data was loaded — ask your owner to add the key in Settings."})}

`),e.write(`data: ${JSON.stringify({done:!0,error:!0,warnings:b.warnings,moduleCounts:b.moduleCounts})}

`),e.end();return}const N=m=>{const _=J(m);e.write(`data: ${JSON.stringify({text:_})}

`)},O=m=>{e.write(`data: ${JSON.stringify({done:!0,...m})}

`),e.end()};let y=await fetch("https://api.openai.com/v1/chat/completions",{method:"POST",headers:{Authorization:`Bearer ${E}`,"Content-Type":"application/json"},body:JSON.stringify({model:"gpt-4o",stream:!0,max_tokens:3e3,temperature:.25,messages:[{role:"system",content:w},{role:"user",content:"Run the Annette Protocol health check now. Sort findings Critical/Urgent first, then Needs Attention, then Info. Produce the full report in the exact format specified."}]})});if(!y.ok&&y.status===404&&(console.warn("[annette] gpt-4o not available, falling back to gpt-4o-mini"),y=await fetch("https://api.openai.com/v1/chat/completions",{method:"POST",headers:{Authorization:`Bearer ${E}`,"Content-Type":"application/json"},body:JSON.stringify({model:"gpt-4o-mini",stream:!0,max_tokens:2500,temperature:.25,messages:[{role:"system",content:w},{role:"user",content:"Run the Annette Protocol health check now. Sort findings Critical/Urgent first, then Needs Attention, then Info. Produce the full report in the exact format specified."}]})})),!y.ok||!y.body){const m=await y.text();N(`

⚠️ OpenAI error: ${m.slice(0,200)}`),O({error:!0});return}const C=y.body.getReader(),x=new TextDecoder;let A="";for(;;){const{done:m,value:_}=await C.read();if(m)break;A+=x.decode(_,{stream:!0});const $=A.split(`
`);A=$.pop()??"";for(const v of $){if(!v.startsWith("data: "))continue;const T=v.slice(6).trim();if(T!=="[DONE]")try{const R=(h=(c=(s=JSON.parse(T).choices)==null?void 0:s[0])==null?void 0:c.delta)==null?void 0:h.content;R&&N(R)}catch{}}}O({warnings:b.warnings,moduleCounts:b.moduleCounts})}catch(f){const i=String((f==null?void 0:f.message)??f);console.error("[annette] error:",i),e.headersSent?(e.write(`data: ${JSON.stringify({text:`

⚠️ Error: ${i}`})}

`),e.write(`data: ${JSON.stringify({done:!0,error:!0})}

`),e.end()):e.status(500).json({error:i})}}export{ze as default};
