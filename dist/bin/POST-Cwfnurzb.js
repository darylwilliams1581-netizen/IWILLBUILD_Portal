import{createRequire as E}from"module";import{g as m,d as s}from"../server.bundle.mjs";import{s as T}from"./drizzle-CZ2vWAZ3.js";import"./express-C3pMhyZZ.js";import"tty";import"os";import"util";import"path";import"./iconv-DatUeE_T.js";import"buffer";import"string_decoder";import"node:zlib";import"./es-abstract-B57Whf45.js";import"url";import"node:fs";import"node:path";import"fs";import"crypto";import"node:http";import"node:buffer";import"node:querystring";import"node:net";import"stream";import"node:events";import"./radix-ui-DB7-u4XC.js";import"./react-router-5dh9OgMp.js";import"./react-dom-CZsMFu04.js";import"async_hooks";import"node:url";import"./mysql2-HVwznT_d.js";import"net";import"events";import"process";import"timers";import"tls";import"zlib";import"node:process";import"./better-auth-B2r-Xofv.js";import"./kysely-9kO2vj_T.js";import"node:crypto";import"./noble-DY0vnRA-.js";import"node:fs/promises";import"node:os";import"./multer-RX-gfMuA.js";import"fs/promises";import"./jszip-BoIs7TcQ.js";import"node:util";import"http";import"https";import"assert";const A=E(import.meta.url);async function _t(a,e){try{const t=m(),o=new Headers;for(const[_,r]of Object.entries(a.headers))r&&o.set(_,Array.isArray(r)?r[0]:r);const i=await t.api.getSession({headers:o});if(!(i!=null&&i.user))return e.status(401).json({error:"Unauthorised"});await s.execute(T`
      CREATE TABLE IF NOT EXISTS site_prestarts (
        id INT PRIMARY KEY AUTO_INCREMENT,
        company_id INT NOT NULL,
        job_id INT NOT NULL,
        created_by_user_id VARCHAR(36) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'draft',

        -- Job details snapshot
        job_number VARCHAR(50),
        job_name VARCHAR(255),
        customer_name VARCHAR(255),
        site_address TEXT,
        prestart_date DATE,
        start_time VARCHAR(10),
        supervisor_name VARCHAR(255),
        first_aid_person VARCHAR(255),
        weather VARCHAR(100),
        rainfall_mm DECIMAL(6,1),

        -- S: Situation
        site_conditions TEXT,
        changed_conditions TEXT,
        weather_concerns TEXT,
        access_issues TEXT,
        public_interface TEXT,
        live_services TEXT,
        underground_services TEXT,
        other_hazards TEXT,
        situation_checkboxes JSON,

        -- M: Mission
        planned_work TEXT,
        work_location TEXT,
        plant_equipment TEXT,
        tools_required TEXT,
        deliveries_expected TEXT,
        key_tasks TEXT,

        -- E: Execution
        execution_checklist JSON,
        critical_controls TEXT,
        task_sequencing TEXT,
        supervisor_instructions TEXT,

        -- A: Administration
        admin_checklist JSON,
        hazards_actions TEXT,
        materials_delivered TEXT,
        plant_used TEXT,

        -- C: Command
        emergency_number VARCHAR(20) DEFAULT '000',
        electricity_emergency VARCHAR(20),
        radio_channel VARCHAR(100),
        assembly_point VARCHAR(255),
        assembly_point_confirmed BOOLEAN DEFAULT FALSE,
        stop_work_authority_confirmed BOOLEAN DEFAULT FALSE,

        -- SWMS
        relevant_swms_ids JSON,
        swms_reviewed_confirmed BOOLEAN DEFAULT FALSE,
        swms_review_notes TEXT,
        swms_snapshot JSON,
        no_swms_required BOOLEAN DEFAULT FALSE,
        no_swms_reason TEXT,

        -- Weather/Delays
        weather_summary TEXT,
        ground_condition VARCHAR(20),
        weather_delay BOOLEAN DEFAULT FALSE,
        delay_hours DECIMAL(4,1),
        delay_reason TEXT,

        -- Supervisor sign-off
        supervisor_signoff_name VARCHAR(255),
        supervisor_signature TEXT,
        submitted_at TIMESTAMP NULL,

        -- Copy-from
        copied_from_id INT NULL,

        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        INDEX idx_sp_company (company_id),
        INDEX idx_sp_job (job_id),
        INDEX idx_sp_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `),await s.execute(T`
      CREATE TABLE IF NOT EXISTS site_prestart_workers (
        id INT PRIMARY KEY AUTO_INCREMENT,
        site_prestart_id INT NOT NULL,
        company_id INT NOT NULL,
        full_name VARCHAR(255) NOT NULL,
        company_employer VARCHAR(255),
        role_trade VARCHAR(255),
        fit_for_work BOOLEAN NOT NULL DEFAULT TRUE,
        white_card_number VARCHAR(100),
        signature TEXT,
        signed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        signed_by_user_id VARCHAR(36),

        INDEX idx_spw_prestart (site_prestart_id),
        FOREIGN KEY (site_prestart_id) REFERENCES site_prestarts(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `),e.json({ok:!0,message:"Site prestart tables created"})}catch(t){console.error("migrate-site-prestart error:",t),e.status(500).json({error:String(t)})}}export{_t as default};
