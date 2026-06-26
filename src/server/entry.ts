import express, { type Express, type NextFunction, type Request, type Response } from "express";
import { fileURLToPath } from "node:url";
import { dirname, extname, join } from "node:path";
import { readFileSync } from "node:fs";

// <api-imports>
import active_ping_post_0 from "./api/active-ping/POST";
import auth_action_get_1 from "./api/auth/[action]/GET";
import auth_action_post_2 from "./api/auth/[action]/POST";
import auth_action_detail_get_3 from "./api/auth/[action]/[detail]/GET";
import auth_action_detail_post_4 from "./api/auth/[action]/[detail]/POST";
import company_get_5 from "./api/company/GET";
import company_put_6 from "./api/company/PUT";
import company_settings_get_7 from "./api/company-settings/GET";
import company_settings_put_8 from "./api/company-settings/PUT";
import cost_guide_get_9 from "./api/cost-guide/GET";
import cost_guide_post_10 from "./api/cost-guide/POST";
import cost_guide_id_delete_11 from "./api/cost-guide/[id]/DELETE";
import cost_guide_id_put_12 from "./api/cost-guide/[id]/PUT";
import cost_guide_import_csv_post from "./api/cost-guide/import-csv/POST";
import cost_guide_export_csv_get from "./api/cost-guide/export-csv/GET";
import dashboard_setup_check_get_13 from "./api/dashboard/setup-check/GET";
import dashboard_todos_get_14 from "./api/dashboard/todos/GET";
import dazza_annette_post_15 from "./api/dazza/annette/POST";
import dazza_chat_post_16 from "./api/dazza/chat/POST";
import dazza_context_get_17 from "./api/dazza/context/GET";
import dazza_knowledge_get_18 from "./api/dazza/knowledge/GET";
import dazza_knowledge_post_19 from "./api/dazza/knowledge/POST";
import dazza_knowledge_id_delete_20 from "./api/dazza/knowledge/[id]/DELETE";
import dazza_knowledge_id_put_21 from "./api/dazza/knowledge/[id]/PUT";
import estimates_get_22 from "./api/estimates/GET";
import estimates_post_23 from "./api/estimates/POST";
import estimates_id_delete_24 from "./api/estimates/[id]/DELETE";
import estimates_id_get_25 from "./api/estimates/[id]/GET";
import estimates_id_put_26 from "./api/estimates/[id]/PUT";
import estimates_id_import_csv_post from "./api/estimates/[id]/import-csv/POST";
import estimates_id_export_csv_get from "./api/estimates/[id]/export-csv/GET";
import files_get_27 from "./api/files/GET";
import files_post_28 from "./api/files/POST";
import files_id_delete_29 from "./api/files/[id]/DELETE";
import files_id_download_get_30 from "./api/files/[id]/download/GET";
import fleet_get_31 from "./api/fleet/GET";
import fleet_post_32 from "./api/fleet/POST";
import fleet_flags_get_33 from "./api/fleet/flags/GET";
import fleet_id_get_34 from "./api/fleet/[id]/GET";
import fleet_id_put_35 from "./api/fleet/[id]/PUT";
import fleet_id_files_get_36 from "./api/fleet/[id]/files/GET";
import fleet_id_prestarts_get_37 from "./api/fleet/[id]/prestarts/GET";
import fleet_id_prestarts_post_38 from "./api/fleet/[id]/prestarts/POST";
import form_templates_get_39 from "./api/form-templates/GET";
import form_templates_post_40 from "./api/form-templates/POST";
import form_templates_id_delete_41 from "./api/form-templates/[id]/DELETE";
import form_templates_id_put_42 from "./api/form-templates/[id]/PUT";
import forms_id_fields_get_43 from "./api/forms/[id]/fields/GET";
import forms_id_fields_post_44 from "./api/forms/[id]/fields/POST";
import forms_id_fields_reorder_post_45 from "./api/forms/[id]/fields/reorder/POST";
import forms_id_fields_fieldId_delete_46 from "./api/forms/[id]/fields/[fieldId]/DELETE";
import forms_id_fields_fieldId_patch_47 from "./api/forms/[id]/fields/[fieldId]/PATCH";
import forms_id_fields_fieldId_thumbnail_post_48 from "./api/forms/[id]/fields/[fieldId]/thumbnail/POST";
import health_get_49 from "./api/health/GET";
import job_forms_id_delete_50 from "./api/job-forms/[id]/DELETE";
import job_forms_id_get_51 from "./api/job-forms/[id]/GET";
import job_forms_id_put_52 from "./api/job-forms/[id]/PUT";
import jobs_get_53 from "./api/jobs/GET";
import jobs_post_54 from "./api/jobs/POST";
import jobs_id_get_55 from "./api/jobs/[id]/GET";
import jobs_id_put_56 from "./api/jobs/[id]/PUT";
import jobs_id_files_get_57 from "./api/jobs/[id]/files/GET";
import jobs_id_forms_get_58 from "./api/jobs/[id]/forms/GET";
import jobs_id_forms_post_59 from "./api/jobs/[id]/forms/POST";
import jobs_id_photos_get_60 from "./api/jobs/[id]/photos/GET";
import jobs_id_photos_post_61 from "./api/jobs/[id]/photos/POST";
import jobs_id_photos_photoId_delete_62 from "./api/jobs/[id]/photos/[photoId]/DELETE";
import jobs_id_photos_photoId_patch_63 from "./api/jobs/[id]/photos/[photoId]/PATCH";
import jobs_id_photos_photoId_download_get_64 from "./api/jobs/[id]/photos/[photoId]/download/GET";
import jobs_id_photos_photoId_replace_post_65 from "./api/jobs/[id]/photos/[photoId]/replace/POST";
import jobs_id_progress_get_66 from "./api/jobs/[id]/progress/GET";
import jobs_id_progress_put_67 from "./api/jobs/[id]/progress/PUT";
import jobs_id_progress_sync_post_68 from "./api/jobs/[id]/progress/sync/POST";
import jobs_id_todos_get_69 from "./api/jobs/[id]/todos/GET";
import jobs_id_todos_post_70 from "./api/jobs/[id]/todos/POST";
import jobs_id_todos_todoId_delete_71 from "./api/jobs/[id]/todos/[todoId]/DELETE";
import jobs_id_todos_todoId_put_72 from "./api/jobs/[id]/todos/[todoId]/PUT";
import me_get_73 from "./api/me/GET";
import me_put_74 from "./api/me/PUT";
import me_change_password_post_75 from "./api/me/change-password/POST";
import migrate_company_settings_post_76 from "./api/migrate-company-settings/POST";
import migrate_dazza_audit_post_77 from "./api/migrate-dazza-audit/POST";
import migrate_dazza_knowledge_post_78 from "./api/migrate-dazza-knowledge/POST";
import migrate_estimates_post_79 from "./api/migrate-estimates/POST";
import migrate_estimating_library_post_80 from "./api/migrate-estimating-library/POST";
import migrate_files_post_81 from "./api/migrate-files/POST";
import migrate_fleet_post_82 from "./api/migrate-fleet/POST";
import migrate_form_fields_post_83 from "./api/migrate-form-fields/POST";
import migrate_form_logic_post_84 from "./api/migrate-form-logic/POST";
import migrate_form_templates_post_85 from "./api/migrate-form-templates/POST";
import migrate_job_forms_post_86 from "./api/migrate-job-forms/POST";
import migrate_job_photos_post_87 from "./api/migrate-job-photos/POST";
import migrate_job_tabs_post_88 from "./api/migrate-job-tabs/POST";
import migrate_jobs_post_89 from "./api/migrate-jobs/POST";
import migrate_notifications_post_90 from "./api/migrate-notifications/POST";
import migrate_owner_console_post_91 from "./api/migrate-owner-console/POST";
import migrate_owner_role_post_92 from "./api/migrate-owner-role/POST";
import migrate_pdf_settings_post_93 from "./api/migrate-pdf-settings/POST";
import migrate_subscriptions_post_94 from "./api/migrate-subscriptions/POST";
import migrate_support_mode_post_95 from "./api/migrate-support-mode/POST";
import migrate_takeoff_pad_post_96 from "./api/migrate-takeoff-pad/POST";
import migrate_team_post_97 from "./api/migrate-team/POST";
import notifications_alerts_get_98 from "./api/notifications/alerts/GET";
import notifications_prefs_get_99 from "./api/notifications/prefs/GET";
import notifications_prefs_put_100 from "./api/notifications/prefs/PUT";
import notifications_read_post_101 from "./api/notifications/read/POST";
import owner_console_activity_get_102 from "./api/owner-console/activity/GET";
import owner_console_companies_get_103 from "./api/owner-console/companies/GET";
import owner_console_companies_post_104 from "./api/owner-console/companies/POST";
import owner_console_stats_get_105 from "./api/owner-console/stats/GET";
import owner_console_users_get_106 from "./api/owner-console/users/GET";
import recipes_get_107 from "./api/recipes/GET";
import recipes_post_108 from "./api/recipes/POST";
import recipes_id_delete_109 from "./api/recipes/[id]/DELETE";
import recipes_id_put_110 from "./api/recipes/[id]/PUT";
import scheduler_jobs_get_111 from "./api/scheduler/jobs/GET";
import settings_backup_get_112 from "./api/settings/backup/GET";
import settings_backup_post_113 from "./api/settings/backup/POST";
import settings_backup_export_get_114 from "./api/settings/backup/export/GET";
import settings_backup_run_post_115 from "./api/settings/backup/run/POST";
import signup_post_116 from "./api/signup/POST";
import auth_verify_email_post from "./api/auth/verify-email/POST";
import auth_resend_verification_post from "./api/auth/resend-verification/POST";
import me_email_status_get from "./api/me/email-status/GET";
import stripe_create_checkout_session_post_117 from "./api/stripe/create-checkout-session/POST";
import stripe_session_sessionId_get_118 from "./api/stripe/session/[sessionId]/GET";
import subscription_create_checkout_post_119 from "./api/subscription/create-checkout/POST";
import subscription_status_get_120 from "./api/subscription/status/GET";
import subscription_webhook_post_121 from "./api/subscription/webhook/POST";
import support_mode_audit_get_122 from "./api/support-mode/audit/GET";
import support_mode_checklist_get_123 from "./api/support-mode/checklist/GET";
import support_mode_checklist_put_124 from "./api/support-mode/checklist/PUT";
import support_mode_enter_post_125 from "./api/support-mode/enter/POST";
import support_mode_exit_post_126 from "./api/support-mode/exit/POST";
import support_mode_status_get_127 from "./api/support-mode/status/GET";
import takeoff_pad_get_128 from "./api/takeoff-pad/GET";
import takeoff_pad_put_129 from "./api/takeoff-pad/PUT";
import team_get_130 from "./api/team/GET";
import team_invite_post_131 from "./api/team/invite/POST";
import team_id_delete_132 from "./api/team/[id]/DELETE";
import team_id_put_133 from "./api/team/[id]/PUT";
// </api-imports>
import { seoRoutes } from "../lib/seo-routes";
import {
	loadAdSenseRuntimeConfig,
	resolveAdSenseTextFile,
	type AdSenseRuntimeConfig,
} from "./adsense-manifest";
import { isSystemHost } from "./seo-host";
import { llmsTxtHandler } from "./llms-txt";

export interface SsrRenderResult {
	html: string;
	head: string;
	status: number;
	redirect?: string;
}

export function registerAdSenseTextRoutes(app: Express, config: AdSenseRuntimeConfig): void {
	app.get("/ads.txt", (_req, res) => {
		const content = resolveAdSenseTextFile(config, "adsTxt");
		if (content === null) {
			res
				.status(404)
				.type("text/plain")
				.set("Cache-Control", "no-cache")
				.send("Not found\n");
			return;
		}
		res.type("text/plain").set("Cache-Control", "no-cache").send(content);
	});

	app.get("/app-ads.txt", (_req, res) => {
		const content = resolveAdSenseTextFile(config, "appAdsTxt");
		if (content === null) {
			res
				.status(404)
				.type("text/plain")
				.set("Cache-Control", "no-cache")
				.send("Not found\n");
			return;
		}
		res.type("text/plain").set("Cache-Control", "no-cache").send(content);
	});
}

export function renderSsrDocument(
	template: string,
	result: Pick<SsrRenderResult, "head" | "html">,
	adSenseConfig: Pick<AdSenseRuntimeConfig, "scriptHtml">,
): string {
	const head = [result.head, adSenseConfig.scriptHtml].filter(Boolean).join("\n");
	return template
		.replace("<!--app-head-->", () => head)
		.replace("<!--app-html-->", () => result.html);
}

function normalizeCommerceApiBaseUrlEnv() {
	if (process.env.GODADDY_API_BASE_URL) return;
	const hostOnly = process.env.VITE_GODADDY_API_HOST;
	if (!hostOnly) return;
	const normalizedHost = hostOnly.replace(/^https?:\/\//, "").trim();
	if (!normalizedHost) return;
	process.env.GODADDY_API_BASE_URL = `https://${normalizedHost}`;
}

import { db } from "./db/client.js";
import { sql } from "drizzle-orm";

normalizeCommerceApiBaseUrlEnv();

const app = express();

// Honour x-forwarded-* from the load balancer so req.protocol/req.hostname
// reflect the public-facing values. Express-maintained parsing respects the
// existing trust-proxy config; direct header reads would let a client spoof
// the sitemap origin in robots.txt.
app.set("trust proxy", true);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Startup self-healing migrations ──────────────────────────────────────────
// NOTE: Drizzle sql.raw rejects DEFAULT '{}' because {} looks like an
// interpolation slot. We use DEFAULT NULL for JSON columns and handle null
// in the application layer (GET returns {} when null; PUT writes the real JSON).
async function runStartupMigrations() {
  // 1. Ensure company_settings table exists
  try {
    await db.execute(sql.raw(
      "CREATE TABLE IF NOT EXISTS company_settings (" +
      "  id             INT AUTO_INCREMENT PRIMARY KEY," +
      "  company_id     INT NOT NULL UNIQUE," +
      "  structure_json LONGTEXT NULL," +
      "  dazza_json     LONGTEXT NULL," +
      "  banner_json    LONGTEXT NULL," +
      "  pdf_json       LONGTEXT NULL," +
      "  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP," +
      "  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP" +
      ")"
    ));
    console.log('[startup-migration] company_settings table ready');
  } catch (e: unknown) {
    const msg = String((e as Error)?.message ?? e);
    // Table already exists is fine
    if (!msg.includes('already exists') && !msg.includes('ER_TABLE_EXISTS')) {
      console.warn('[startup-migration] company_settings CREATE failed:', msg);
    }
  }

  // 2. Ensure individual columns exist — check INFORMATION_SCHEMA first, then ALTER
  const colsToEnsure: Array<{ table: string; column: string; definition: string }> = [
    { table: 'profiles',         column: 'notification_prefs', definition: 'TEXT NULL' },
    { table: 'profiles',         column: 'last_login_at',      definition: 'DATETIME NULL' },
    { table: 'profiles',         column: 'last_active_at',     definition: 'DATETIME NULL' },
    // Email verification on BetterAuth user table
    { table: 'user',             column: 'email_verified',     definition: 'BOOLEAN NOT NULL DEFAULT FALSE' },
    { table: 'company_settings', column: 'pdf_json',        definition: 'LONGTEXT NULL' },
    { table: 'company_settings', column: 'backup_json',     definition: 'LONGTEXT NULL' },
    { table: 'company_settings', column: 'last_backup_at',  definition: 'DATETIME NULL' },
    // Subscription columns
    { table: 'companies', column: 'plan',                   definition: "VARCHAR(30) NOT NULL DEFAULT 'trial'" },
    { table: 'companies', column: 'subscription_status',    definition: "VARCHAR(30) NOT NULL DEFAULT 'trial'" },
    { table: 'companies', column: 'trial_ends_at',          definition: 'DATETIME NULL' },
    { table: 'companies', column: 'stripe_customer_id',     definition: 'VARCHAR(100) NULL' },
    { table: 'companies', column: 'stripe_subscription_id', definition: 'VARCHAR(100) NULL' },
    { table: 'companies', column: 'stripe_price_id',        definition: 'VARCHAR(100) NULL' },
    { table: 'companies', column: 'max_users',              definition: 'INT NOT NULL DEFAULT 1' },
    // Scheduler columns on jobs
    { table: 'jobs', column: 'start_date',         definition: 'DATE NULL' },
    { table: 'jobs', column: 'finish_date',        definition: 'DATE NULL' },
    { table: 'jobs', column: 'supervisor_user_id', definition: 'VARCHAR(36) NULL' },
    { table: 'jobs', column: 'crew_name',          definition: 'VARCHAR(255) NULL' },
    { table: 'jobs', column: 'progress',           definition: 'INT NOT NULL DEFAULT 0' },
  ];
  for (const { table, column, definition } of colsToEnsure) {
    try {
      const [checkRows] = await db.execute(
        sql`SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${table} AND COLUMN_NAME = ${column}`
      ) as unknown as [Array<{ cnt: number }>, unknown];
      const exists = Number(checkRows?.[0]?.cnt ?? 0) > 0;
      if (!exists) {
        await db.execute(sql.raw(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`));
        console.log(`[startup-migration] Added ${table}.${column}`);
      }
    } catch (e: unknown) {
      const msg = String((e as Error)?.message ?? e);
      const isDup = msg.includes('ER_DUP_FIELDNAME') || msg.includes('Duplicate column name');
      if (!isDup) {
        console.warn(`[startup-migration] Could not ensure ${table}.${column}:`, msg);
      }
    }
  }

  // Back-fill trial_ends_at for companies that existed before subscription columns
  try {
    await db.execute(sql`
      UPDATE companies SET trial_ends_at = DATE_ADD(created_at, INTERVAL 30 DAY)
      WHERE trial_ends_at IS NULL
    `);
  } catch { /* non-fatal */ }
}
runStartupMigrations().catch((e) => console.warn('[startup-migration] Failed:', e));
// ─────────────────────────────────────────────────────────────────────────────

// ── Temporary: table diagnostic (no auth — structure only, no data) ──────────
app.get('/api/_diag/settings-table', async (_req, res) => {
  try {
    const [cols] = await db.execute(
      sql`SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'company_settings' ORDER BY ORDINAL_POSITION`
    ) as unknown as [Array<{ COLUMN_NAME: string; DATA_TYPE: string }>, unknown];

    if (!cols || cols.length === 0) {
      return res.json({ exists: false, columns: [], rowCount: 0 });
    }

    const [rowCount] = await db.execute(
      sql`SELECT COUNT(*) as cnt FROM company_settings`
    ) as unknown as [Array<{ cnt: number }>, unknown];

    // Also read raw dazza_json for debugging
    const [rows] = await db.execute(
      sql`SELECT company_id, LEFT(dazza_json, 200) as dazza_preview FROM company_settings LIMIT 5`
    ) as unknown as [Array<{ company_id: number; dazza_preview: string | null }>, unknown];

    res.json({ exists: true, columns: cols, rowCount: rowCount?.[0]?.cnt ?? 0, rows: rows ?? [] });
  } catch (e) {
    res.status(500).json({ error: String((e as Error)?.message ?? e) });
  }
});
// ─────────────────────────────────────────────────────────────────────────────

// <api-registrations>
app.post("/api/active-ping", active_ping_post_0);
// ── Email verification (must be before BetterAuth wildcard) ──────────────────
app.post("/api/auth/verify-email", auth_verify_email_post);
app.post("/api/auth/resend-verification", auth_resend_verification_post);
// ── BetterAuth wildcard handlers ─────────────────────────────────────────────
app.get("/api/auth/:action", auth_action_get_1);
app.post("/api/auth/:action", auth_action_post_2);
app.get("/api/auth/:action/:detail", auth_action_detail_get_3);
app.post("/api/auth/:action/:detail", auth_action_detail_post_4);
app.get("/api/company", company_get_5);
app.put("/api/company", company_put_6);
app.get("/api/company-settings", company_settings_get_7);
app.put("/api/company-settings", company_settings_put_8);
app.get("/api/cost-guide", cost_guide_get_9);
app.post("/api/cost-guide", cost_guide_post_10);
app.post("/api/cost-guide/import-csv", cost_guide_import_csv_post);
app.get("/api/cost-guide/export-csv", cost_guide_export_csv_get);
app.delete("/api/cost-guide/:id", cost_guide_id_delete_11);
app.put("/api/cost-guide/:id", cost_guide_id_put_12);
app.get("/api/dashboard/setup-check", dashboard_setup_check_get_13);
app.get("/api/dashboard/todos", dashboard_todos_get_14);
app.post("/api/dazza/annette", dazza_annette_post_15);
app.post("/api/dazza/chat", dazza_chat_post_16);
app.get("/api/dazza/context", dazza_context_get_17);
app.get("/api/dazza/knowledge", dazza_knowledge_get_18);
app.post("/api/dazza/knowledge", dazza_knowledge_post_19);
app.delete("/api/dazza/knowledge/:id", dazza_knowledge_id_delete_20);
app.put("/api/dazza/knowledge/:id", dazza_knowledge_id_put_21);
app.get("/api/estimates", estimates_get_22);
app.post("/api/estimates", estimates_post_23);
app.post("/api/estimates/:id/import-csv", estimates_id_import_csv_post);
app.get("/api/estimates/:id/export-csv", estimates_id_export_csv_get);
app.delete("/api/estimates/:id", estimates_id_delete_24);
app.get("/api/estimates/:id", estimates_id_get_25);
app.put("/api/estimates/:id", estimates_id_put_26);
app.get("/api/files", files_get_27);
app.post("/api/files", files_post_28);
app.delete("/api/files/:id", files_id_delete_29);
app.get("/api/files/:id/download", files_id_download_get_30);
app.get("/api/fleet", fleet_get_31);
app.post("/api/fleet", fleet_post_32);
app.get("/api/fleet/flags", fleet_flags_get_33);
app.get("/api/fleet/:id", fleet_id_get_34);
app.put("/api/fleet/:id", fleet_id_put_35);
app.get("/api/fleet/:id/files", fleet_id_files_get_36);
app.get("/api/fleet/:id/prestarts", fleet_id_prestarts_get_37);
app.post("/api/fleet/:id/prestarts", fleet_id_prestarts_post_38);
app.get("/api/form-templates", form_templates_get_39);
app.post("/api/form-templates", form_templates_post_40);
app.delete("/api/form-templates/:id", form_templates_id_delete_41);
app.put("/api/form-templates/:id", form_templates_id_put_42);
app.get("/api/forms/:id/fields", forms_id_fields_get_43);
app.post("/api/forms/:id/fields", forms_id_fields_post_44);
app.post("/api/forms/:id/fields/reorder", forms_id_fields_reorder_post_45);
app.delete("/api/forms/:id/fields/:fieldId", forms_id_fields_fieldId_delete_46);
app.patch("/api/forms/:id/fields/:fieldId", forms_id_fields_fieldId_patch_47);
app.post("/api/forms/:id/fields/:fieldId/thumbnail", forms_id_fields_fieldId_thumbnail_post_48);
app.get("/api/health", health_get_49);
app.delete("/api/job-forms/:id", job_forms_id_delete_50);
app.get("/api/job-forms/:id", job_forms_id_get_51);
app.put("/api/job-forms/:id", job_forms_id_put_52);
app.get("/api/jobs", jobs_get_53);
app.post("/api/jobs", jobs_post_54);
app.get("/api/jobs/:id", jobs_id_get_55);
app.put("/api/jobs/:id", jobs_id_put_56);
app.get("/api/jobs/:id/files", jobs_id_files_get_57);
app.get("/api/jobs/:id/forms", jobs_id_forms_get_58);
app.post("/api/jobs/:id/forms", jobs_id_forms_post_59);
app.get("/api/jobs/:id/photos", jobs_id_photos_get_60);
app.post("/api/jobs/:id/photos", jobs_id_photos_post_61);
app.delete("/api/jobs/:id/photos/:photoId", jobs_id_photos_photoId_delete_62);
app.patch("/api/jobs/:id/photos/:photoId", jobs_id_photos_photoId_patch_63);
app.get("/api/jobs/:id/photos/:photoId/download", jobs_id_photos_photoId_download_get_64);
app.post("/api/jobs/:id/photos/:photoId/replace", jobs_id_photos_photoId_replace_post_65);
app.get("/api/jobs/:id/progress", jobs_id_progress_get_66);
app.put("/api/jobs/:id/progress", jobs_id_progress_put_67);
app.post("/api/jobs/:id/progress/sync", jobs_id_progress_sync_post_68);
app.get("/api/jobs/:id/todos", jobs_id_todos_get_69);
app.post("/api/jobs/:id/todos", jobs_id_todos_post_70);
app.delete("/api/jobs/:id/todos/:todoId", jobs_id_todos_todoId_delete_71);
app.put("/api/jobs/:id/todos/:todoId", jobs_id_todos_todoId_put_72);
app.get("/api/me", me_get_73);
app.put("/api/me", me_put_74);
app.post("/api/me/change-password", me_change_password_post_75);
app.get("/api/me/email-status", me_email_status_get);
app.post("/api/migrate-company-settings", migrate_company_settings_post_76);
app.post("/api/migrate-dazza-audit", migrate_dazza_audit_post_77);
app.post("/api/migrate-dazza-knowledge", migrate_dazza_knowledge_post_78);
app.post("/api/migrate-estimates", migrate_estimates_post_79);
app.post("/api/migrate-estimating-library", migrate_estimating_library_post_80);
app.post("/api/migrate-files", migrate_files_post_81);
app.post("/api/migrate-fleet", migrate_fleet_post_82);
app.post("/api/migrate-form-fields", migrate_form_fields_post_83);
app.post("/api/migrate-form-logic", migrate_form_logic_post_84);
app.post("/api/migrate-form-templates", migrate_form_templates_post_85);
app.post("/api/migrate-job-forms", migrate_job_forms_post_86);
app.post("/api/migrate-job-photos", migrate_job_photos_post_87);
app.post("/api/migrate-job-tabs", migrate_job_tabs_post_88);
app.post("/api/migrate-jobs", migrate_jobs_post_89);
app.post("/api/migrate-notifications", migrate_notifications_post_90);
app.post("/api/migrate-owner-console", migrate_owner_console_post_91);
app.post("/api/migrate-owner-role", migrate_owner_role_post_92);
app.post("/api/migrate-pdf-settings", migrate_pdf_settings_post_93);
app.post("/api/migrate-subscriptions", migrate_subscriptions_post_94);
app.post("/api/migrate-support-mode", migrate_support_mode_post_95);
app.post("/api/migrate-takeoff-pad", migrate_takeoff_pad_post_96);
app.post("/api/migrate-team", migrate_team_post_97);
app.get("/api/notifications/alerts", notifications_alerts_get_98);
app.get("/api/notifications/prefs", notifications_prefs_get_99);
app.put("/api/notifications/prefs", notifications_prefs_put_100);
app.post("/api/notifications/read", notifications_read_post_101);
app.get("/api/owner-console/activity", owner_console_activity_get_102);
app.get("/api/owner-console/companies", owner_console_companies_get_103);
app.post("/api/owner-console/companies", owner_console_companies_post_104);
app.get("/api/owner-console/stats", owner_console_stats_get_105);
app.get("/api/owner-console/users", owner_console_users_get_106);
app.get("/api/recipes", recipes_get_107);
app.post("/api/recipes", recipes_post_108);
app.delete("/api/recipes/:id", recipes_id_delete_109);
app.put("/api/recipes/:id", recipes_id_put_110);
app.get("/api/scheduler/jobs", scheduler_jobs_get_111);
app.get("/api/settings/backup", settings_backup_get_112);
app.post("/api/settings/backup", settings_backup_post_113);
app.get("/api/settings/backup/export", settings_backup_export_get_114);
app.post("/api/settings/backup/run", settings_backup_run_post_115);
app.post("/api/signup", signup_post_116);
app.post("/api/stripe/create-checkout-session", stripe_create_checkout_session_post_117);
app.get("/api/stripe/session/:sessionId", stripe_session_sessionId_get_118);
app.post("/api/subscription/create-checkout", subscription_create_checkout_post_119);
app.get("/api/subscription/status", subscription_status_get_120);
app.post("/api/subscription/webhook", subscription_webhook_post_121);
app.get("/api/support-mode/audit", support_mode_audit_get_122);
app.get("/api/support-mode/checklist", support_mode_checklist_get_123);
app.put("/api/support-mode/checklist", support_mode_checklist_put_124);
app.post("/api/support-mode/enter", support_mode_enter_post_125);
app.post("/api/support-mode/exit", support_mode_exit_post_126);
app.get("/api/support-mode/status", support_mode_status_get_127);
app.get("/api/takeoff-pad", takeoff_pad_get_128);
app.put("/api/takeoff-pad", takeoff_pad_put_129);
app.get("/api/team", team_get_130);
app.post("/api/team/invite", team_invite_post_131);
app.delete("/api/team/:id", team_id_delete_132);
app.put("/api/team/:id", team_id_put_133);
// </api-registrations>

// Error middleware must be registered AFTER the routes it protects; Express
// only passes errors to middleware defined later in the stack.
app.use("/api", (err: unknown, req: Request, res: Response, _next: NextFunction) => {
	// Always respond JSON on /api so clients parsing response.json() don't
	// receive Express's default HTML error page for non-Error throws.
	console.error("ssr.api.error", {
		url: req.url,
		error: err instanceof Error ? err.stack : String(err),
	});
	res.status(500).json({ error: "Internal server error" });
});

function baseUrl(req: Request): string {
	return `${req.protocol}://${req.hostname}`;
}

function escapeXml(s: string): string {
	return s.replace(/[&<>"']/g, (c) =>
		({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!,
	);
}

app.get("/robots.txt", (req, res) => {
	if (isSystemHost(req)) {
		res
			.type("text/plain")
			.set("Cache-Control", "public, max-age=60, must-revalidate").set("Vary", "Host")
			.send("User-agent: *\nDisallow: /\n");
		return;
	}
	const base = baseUrl(req);
	const body = [
		"User-agent: *",
		"Allow: /",
		"",
		`Sitemap: ${base}/sitemap.xml`,
		"",
	].join("\n");
	res.type("text/plain").set("Cache-Control", "public, max-age=60, must-revalidate").set("Vary", "Host").send(body);
});

app.get("/sitemap.xml", (req, res) => {
	if (isSystemHost(req)) {
		const empty = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"/>\n`;
		res.type("application/xml").set("Cache-Control", "public, max-age=60, must-revalidate").set("Vary", "Host").send(empty);
		return;
	}
	const base = baseUrl(req);
	const urls = seoRoutes
		.filter((r) => typeof r.path === "string" && r.path.startsWith("/"))
		.map((r) => {
			const loc = `${base}${r.path}`;
			const parts = [`    <loc>${escapeXml(loc)}</loc>`];
			if (r.lastmod) parts.push(`    <lastmod>${escapeXml(r.lastmod)}</lastmod>`);
			if (r.changefreq) parts.push(`    <changefreq>${r.changefreq}</changefreq>`);
			if (r.priority !== undefined)
				parts.push(`    <priority>${r.priority.toFixed(1)}</priority>`);
			return `  <url>\n${parts.join("\n")}\n  </url>`;
		})
		.join("\n");
	const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
	res.type("application/xml").set("Cache-Control", "public, max-age=60, must-revalidate").set("Vary", "Host").send(body);
});

app.get("/llms.txt", llmsTxtHandler);

if (import.meta.env.PROD) {
	const __dirname = dirname(fileURLToPath(import.meta.url));
	const clientDir = join(__dirname, "client");
	const adSenseRuntimeConfig = loadAdSenseRuntimeConfig(__dirname);

	registerAdSenseTextRoutes(app, adSenseRuntimeConfig);

	app.use(
		express.static(clientDir, {
			index: false,
			setHeaders(res, filePath) {
				res.set(
					"Cache-Control",
					filePath.includes("/assets/")
						? "public, max-age=31536000, immutable"
						: "no-cache",
				);
			},
		}),
	);

	app.use((_req, res, next) => {
		res.set("Cache-Control", "no-cache");
		next();
	});

	let template: string;
	try {
		template = readFileSync(join(clientDir, "index.html"), "utf-8");
	} catch (err) {
		console.error("ssr.template.load-failed", {
			path: join(clientDir, "index.html"),
			error: err instanceof Error ? err.message : String(err),
		});
		process.exit(1);
	}
	if (!template.includes("<!--app-head-->") || !template.includes("<!--app-html-->")) {
		// Fail fast at boot, same as a template load failure above: without
		// markers, every .replace() call on the render path is a no-op and we
		// would serve a shell with no <head> content and no rendered body on
		// every request. Preferring process.exit over a degraded mode ensures
		// an operator notices and fixes the build rather than serving broken
		// SEO-invisible pages indefinitely.
		console.error("ssr.template.markers-missing", {
			hasHead: template.includes("<!--app-head-->"),
			hasHtml: template.includes("<!--app-html-->"),
		});
		process.exit(1);
	}
	const fallbackShell = template
		.replace("<!--app-head-->", "")
		.replace("<!--app-html-->", "");

	// Resolve the SSR module once into a stable render function. A failed
	// load is unrecoverable at runtime - exiting lets the container
	// scheduler restart with a clean slate rather than leaving the server
	// to serve silent 503s indefinitely against a single startup log.
	let renderFn: ((url: string) => Promise<SsrRenderResult>) | null = null;
	const SSR_MODULE_LOAD_TIMEOUT_MS = 30_000;
	const loadTimeout = setTimeout(() => {
		if (renderFn !== null) return;
		console.error("ssr.module.load-timeout", {
			timeoutMs: SSR_MODULE_LOAD_TIMEOUT_MS,
		});
		process.exit(1);
	}, SSR_MODULE_LOAD_TIMEOUT_MS);
	loadTimeout.unref();
	import("../entry-server").then(
		(mod) => {
			clearTimeout(loadTimeout);
			renderFn = mod.render;
		},
		(err) => {
			clearTimeout(loadTimeout);
			console.error("ssr.module.load-failed", {
				error: err instanceof Error ? err.stack : String(err),
			});
			process.exit(1);
		},
	);

	app.get(/.*/, async (req, res, next) => {
		if (req.method !== "GET") return next();
		if (req.path.startsWith("/api")) return next();
		if (extname(req.path)) return next();
		const sendFallback = () =>
			res
				.status(503)
				.set("Content-Type", "text/html; charset=utf-8")
				.set("Cache-Control", "no-store")
				.send(fallbackShell);
		if (renderFn === null) {
			// Module not yet resolved; fall back without logging to avoid startup
			// noise before the first render is even possible. A terminal load
			// failure (import reject or 30s timeout) process.exit(1)s from the
			// loader above, so this branch is only the brief warmup window.
			return sendFallback();
		}
		try {
			const result = await renderFn(req.url);
			if (result.redirect) {
				// Redirect thrown from a loader/action surfaces as a Response.
				// Forward it so the browser actually navigates to the new URL
				// instead of seeing an empty shell with a stale status.
				res.redirect(result.status, result.redirect);
				return;
			}
			if (!result.html) {
				// A non-redirect Response was thrown from a loader (e.g.
				// `throw new Response(null, { status: 404 })`). renderToString
				// produced no markup, so we have a real status but no body.
				// Log so the case is observable in ops dashboards, and mark
				// no-store so CDNs don't cache an empty page as a valid hit.
				// User-visible 404 / error pages should come from a route
				// errorElement, not from this fallback path.
				console.error("ssr.render.error-response", {
					url: req.url,
					status: result.status,
				});
				res
					.status(result.status)
					.set("Content-Type", "text/html; charset=utf-8")
					.set("Cache-Control", "no-store")
					.send(fallbackShell);
				return;
			}
			// Per-host SEO injection. System URLs get a noindex meta so
			// crawlers drop them from the index over time; customer-attached
			// hosts get a self-canonical link so search engines treat them
			// as authoritative for the rendered content.
			const seoHead = isSystemHost(req)
				? `<meta name="robots" content="noindex,nofollow">`
				: `<link rel="canonical" href="${escapeXml(`${req.protocol}://${req.hostname}${req.path}`)}">`;
			// Function replacements disable String.replace's $-special sequences
			// ($&, $', $`, $$) so user-authored titles / JSON-LD like
			// "Save $& today" insert literally instead of being interpolated.
			const out = renderSsrDocument(
				template,
				{ ...result, head: seoHead + result.head },
				adSenseRuntimeConfig,
			);
			res
				.status(result.status)
				.set("Content-Type", "text/html; charset=utf-8")
				.set("Cache-Control", "no-cache")
				.send(out);
		} catch (err) {
			// 503 surfaces the failure in CDN/monitoring without caching a broken
			// page as success. console.error (not warn) puts it at the right log
			// level for the observability pipeline to alert on.
			console.error("ssr.render.failed", {
				url: req.url,
				// Log the full stack — React's renderToString annotates it with
				// the failing component's call tree, which the message alone
				// discards.
				error: err instanceof Error ? err.stack : String(err),
			});
			sendFallback();
		}
	});

	const shutdown = async (signal: string) => {
		console.log(`Got ${signal}, shutting down gracefully...`);
		// Scope the ERR_MODULE_NOT_FOUND suppression to the import() only.
		// A closeConnection() failure that happens to carry the same code
		// (unlikely but possible for wrapped errors) must not be silently
		// swallowed - it indicates a real db-close failure worth logging.
		let mod: { closeConnection?: () => Promise<void> | void } | null = null;
		try {
			const dbClient = "./db/client" + ".js";
			mod = await import(/* @vite-ignore */ dbClient);
		} catch (error: unknown) {
			const code = (error as { code?: string } | null)?.code;
			if (code !== "ERR_MODULE_NOT_FOUND") {
				console.error("ssr.shutdown.db-import-failed", {
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}
		if (mod && typeof mod.closeConnection === "function") {
			try {
				await mod.closeConnection();
				console.log("Database connections closed");
			} catch (error: unknown) {
				console.error("ssr.shutdown.db-close-failed", {
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}
		process.exit(0);
	};

	(["SIGTERM", "SIGINT"] as const).forEach((signal) => {
		process.once(signal, () => {
			void shutdown(signal);
		});
	});

	const rawPort = process.env.PORT || "3000";
	const port = parseInt(rawPort, 10);
	if (!Number.isInteger(port) || port <= 0 || port > 65535) {
		// parseInt("abc") returns NaN; passing that to app.listen throws
		// synchronously before the server.on("error") handler below can catch
		// it. Fail fast with an actionable log rather than a cryptic crash.
		console.error("ssr.server.invalid-port", { rawPort });
		process.exit(1);
	}
	const host = process.env.HOST || "0.0.0.0";
	const server = app.listen(port, host, () => {
		console.log(`Server listening on http://${host}:${port}`);
		// Run lightweight startup migrations (CREATE TABLE IF NOT EXISTS — safe to re-run)
		void (async () => {
			try {
				const { db: _db } = await import('./db/client.js');
				const { sql: _sql } = await import('drizzle-orm');
				await _db.execute(_sql`
					CREATE TABLE IF NOT EXISTS dazza_knowledge (
						id            INT AUTO_INCREMENT PRIMARY KEY,
						company_id    INT NOT NULL,
						title         VARCHAR(255) NOT NULL,
						category      VARCHAR(100) NOT NULL DEFAULT 'Company procedure',
						content       LONGTEXT NOT NULL,
						source_name   VARCHAR(255) DEFAULT NULL,
						active        TINYINT(1) NOT NULL DEFAULT 1,
						created_by    VARCHAR(255) NOT NULL DEFAULT '',
						created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
						updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
						INDEX idx_dk_company (company_id),
						INDEX idx_dk_active  (company_id, active)
					) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
				`);
				console.log('[startup] dazza_knowledge table ready');
			} catch (e) {
				console.warn('[startup] dazza_knowledge migration skipped:', (e as Error)?.message?.slice(0, 120));
			}
		})();
	});
	server.on("error", (err: NodeJS.ErrnoException) => {
		console.error("ssr.server.listen-failed", {
			port,
			host,
			code: err.code,
			error: err.message,
		});
		process.exit(1);
	});
}

export default app;
