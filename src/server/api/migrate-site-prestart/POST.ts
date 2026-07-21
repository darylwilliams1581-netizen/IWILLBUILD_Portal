import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../lib/auth/auth.js';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    // site_prestarts table
    await db.execute(sql`
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
    `);

    // site_prestart_workers table
    await db.execute(sql`
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
    `);

    res.json({ ok: true, message: 'Site prestart tables created' });
  } catch (err) {
    console.error('migrate-site-prestart error:', err);
    res.status(500).json({ error: String(err) });
  }
}
