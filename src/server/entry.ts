import express, { type Express, type NextFunction, type Request, type Response } from "express";
import { fileURLToPath } from "node:url";
import { dirname, extname, join } from "node:path";
import { readFileSync } from "node:fs";
import { getSecret } from '#airo/secrets';
import { globalApiLimiter, authApiLimiter } from './lib/api-rate-limiter.js';
import { requirePlatformOwner } from './lib/platform-owner-guard.js';

// <api-imports>
import _h_active_ping_post_0 from "./api/active-ping/POST";
import _h_auth_change_email_post_1 from "./api/auth/change-email/POST";
import _h_auth_change_password_post_2 from "./api/auth/change-password/POST";
import _h_auth_check_signup_status_post_3 from "./api/auth/check-signup-status/POST";
import _h_auth_forgot_password_post_4 from "./api/auth/forgot-password/POST";
import _h_auth_pin_login_post_5 from "./api/auth/pin-login/POST";
import _h_auth_resend_verification_post_6 from "./api/auth/resend-verification/POST";
import _h_auth_reset_password_post_7 from "./api/auth/reset-password/POST";
import _h_auth_resume_signup_post_8 from "./api/auth/resume-signup/POST";
import _h_auth_self_verify_post_9 from "./api/auth/self-verify/POST";
import _h_auth_send_sms_code_post_10 from "./api/auth/send-sms-code/POST";
import _h_auth_sms_configured_get_11 from "./api/auth/sms-configured/GET";
import _h_auth_sms_recovery_post_12 from "./api/auth/sms-recovery/POST";
import _h_auth_trusted_devices_get_13 from "./api/auth/trusted-devices/GET";
import _h_auth_trusted_devices_post_14 from "./api/auth/trusted-devices/POST";
import _h_auth_trusted_devices_deviceid_delete_15 from "./api/auth/trusted-devices/[deviceId]/DELETE";
import _h_auth_validate_reset_token_get_16 from "./api/auth/validate-reset-token/GET";
import _h_auth_verify_email_post_17 from "./api/auth/verify-email/POST";
import _h_auth_verify_sms_code_post_18 from "./api/auth/verify-sms-code/POST";
import _h_auth_action_get_19 from "./api/auth/[action]/GET";
import _h_auth_action_post_20 from "./api/auth/[action]/POST";
import _h_auth_action_detail_get_21 from "./api/auth/[action]/[detail]/GET";
import _h_auth_action_detail_post_22 from "./api/auth/[action]/[detail]/POST";
import _h_billing_cancel_subscription_post_23 from "./api/billing/cancel-subscription/POST";
import _h_billing_cancellation_feedback_post_24 from "./api/billing/cancellation-feedback/POST";
import _h_billing_customer_portal_post_25 from "./api/billing/customer-portal/POST";
import _h_billing_reactivate_subscription_post_26 from "./api/billing/reactivate-subscription/POST";
import _h_billing_upgrade_subscription_post_27 from "./api/billing/upgrade-subscription/POST";
import _h_company_get_28 from "./api/company/GET";
import _h_company_put_29 from "./api/company/PUT";
import _h_company_logo_post_30 from "./api/company/logo/POST";
import _h_company_settings_get_31 from "./api/company-settings/GET";
import _h_company_settings_put_32 from "./api/company-settings/PUT";
import _h_contact_post_33 from "./api/contact/POST";
import _h_cost_guide_get_34 from "./api/cost-guide/GET";
import _h_cost_guide_post_35 from "./api/cost-guide/POST";
import _h_cost_guide_export_csv_get_36 from "./api/cost-guide/export-csv/GET";
import _h_cost_guide_import_csv_post_37 from "./api/cost-guide/import-csv/POST";
import _h_cost_guide_id_delete_38 from "./api/cost-guide/[id]/DELETE";
import _h_cost_guide_id_put_39 from "./api/cost-guide/[id]/PUT";
import _h_customers_get_40 from "./api/customers/GET";
import _h_customers_post_41 from "./api/customers/POST";
import _h_customers_id_delete_42 from "./api/customers/[id]/DELETE";
import _h_customers_id_get_43 from "./api/customers/[id]/GET";
import _h_customers_id_put_44 from "./api/customers/[id]/PUT";
import _h_dashboard_kpi_get_45 from "./api/dashboard/kpi/GET";
import _h_dashboard_setup_check_get_46 from "./api/dashboard/setup-check/GET";
import _h_dashboard_todos_get_47 from "./api/dashboard/todos/GET";
import _h_dazza_annette_post_48 from "./api/dazza/annette/POST";
import _h_dazza_brain_hive_approve_post_49 from "./api/dazza/brain/hive/approve/POST";
import _h_dazza_brain_hive_reject_post_50 from "./api/dazza/brain/hive/reject/POST";
import _h_dazza_brain_status_get_51 from "./api/dazza/brain/status/GET";
import _h_dazza_chat_post_52 from "./api/dazza/chat/POST";
import _h_dazza_chat_v2_post_53 from "./api/dazza/chat-v2/POST";
import _h_dazza_chat_v2_stream_post_54 from "./api/dazza/chat-v2/stream/POST";
import _h_dazza_context_get_55 from "./api/dazza/context/GET";
import _h_dazza_key_status_get_56 from "./api/dazza/key-status/GET";
import _h_dazza_knowledge_get_57 from "./api/dazza/knowledge/GET";
import _h_dazza_knowledge_post_58 from "./api/dazza/knowledge/POST";
import _h_dazza_knowledge_id_delete_59 from "./api/dazza/knowledge/[id]/DELETE";
import _h_dazza_knowledge_id_put_60 from "./api/dazza/knowledge/[id]/PUT";
import _h_document_templates_get_85 from "./api/document-templates/GET";
import _h_document_templates_post_86 from "./api/document-templates/POST";
import _h_document_templates_id_delete_87 from "./api/document-templates/[id]/DELETE";
import _h_document_templates_id_get_88 from "./api/document-templates/[id]/GET";
import _h_document_templates_id_put_89 from "./api/document-templates/[id]/PUT";
import _h_document_templates_id_import_docx_post_90 from "./api/document-templates/[id]/import-docx/POST";
import _h_documents_get_91 from "./api/documents/GET";
import _h_documents_share_token_get_92 from "./api/documents/share/[token]/GET";
import _h_documents_share_token_post_93 from "./api/documents/share/[token]/POST";
import _h_documents_id_get_94 from "./api/documents/[id]/GET";
import _h_documents_id_put_95 from "./api/documents/[id]/PUT";
import _h_documents_id_events_get_96 from "./api/documents/[id]/events/GET";
import _h_documents_id_share_delete_97 from "./api/documents/[id]/share/DELETE";
import _h_documents_id_share_post_98 from "./api/documents/[id]/share/POST";
import _h_drawings_get_99 from "./api/drawings/GET";
import _h_drawings_post_100 from "./api/drawings/POST";
import _h_drawings_upload_post_101 from "./api/drawings/upload/POST";
import _h_drawings_id_delete_102 from "./api/drawings/[id]/DELETE";
import _h_drawings_id_patch_103 from "./api/drawings/[id]/PATCH";
import _h_drawings_id_markup_post_104 from "./api/drawings/[id]/markup/POST";
import _h_estimates_get_105 from "./api/estimates/GET";
import _h_estimates_post_106 from "./api/estimates/POST";
import _h_estimates_id_delete_107 from "./api/estimates/[id]/DELETE";
import _h_estimates_id_get_108 from "./api/estimates/[id]/GET";
import _h_estimates_id_put_109 from "./api/estimates/[id]/PUT";
import _h_estimates_id_export_csv_get_110 from "./api/estimates/[id]/export-csv/GET";
import _h_estimates_id_export_pdf_get_111 from "./api/estimates/[id]/export-pdf/GET";
import _h_estimates_id_import_csv_post_112 from "./api/estimates/[id]/import-csv/POST";
import _h_external_form_token_get_113 from "./api/external/form/[token]/GET";
import _h_external_form_token_post_114 from "./api/external/form/[token]/POST";
import _h_files_get_115 from "./api/files/GET";
import _h_files_post_116 from "./api/files/POST";
import _h_files_id_delete_117 from "./api/files/[id]/DELETE";
import _h_files_id_download_get_118 from "./api/files/[id]/download/GET";
import _h_form_templates_get_137 from "./api/form-templates/GET";
import _h_form_templates_post_138 from "./api/form-templates/POST";
import _h_form_templates_seed_post_139 from "./api/form-templates/seed/POST";
import _h_form_templates_id_delete_140 from "./api/form-templates/[id]/DELETE";
import _h_form_templates_id_put_141 from "./api/form-templates/[id]/PUT";
import _h_forms_submissions_get_142 from "./api/forms/submissions/GET";
import _h_forms_templates_id_share_link_post_143 from "./api/forms/templates/[id]/share-link/POST";
import _h_forms_id_fields_get_144 from "./api/forms/[id]/fields/GET";
import _h_forms_id_fields_post_145 from "./api/forms/[id]/fields/POST";
import _h_forms_id_fields_reorder_post_146 from "./api/forms/[id]/fields/reorder/POST";
import _h_forms_id_fields_fieldid_delete_147 from "./api/forms/[id]/fields/[fieldId]/DELETE";
import _h_forms_id_fields_fieldid_patch_148 from "./api/forms/[id]/fields/[fieldId]/PATCH";
import _h_forms_id_fields_fieldid_thumbnail_post_149 from "./api/forms/[id]/fields/[fieldId]/thumbnail/POST";
import _h_health_get_150 from "./api/health/GET";
import _h_invoices_get_173 from "./api/invoices/GET";
import _h_invoices_post_174 from "./api/invoices/POST";
import _h_invoices_id_delete_175 from "./api/invoices/[id]/DELETE";
import _h_invoices_id_get_176 from "./api/invoices/[id]/GET";
import _h_invoices_id_put_177 from "./api/invoices/[id]/PUT";
import _h_invoices_id_duplicate_post_178 from "./api/invoices/[id]/duplicate/POST";
import _h_invoices_id_export_pdf_get_179 from "./api/invoices/[id]/export-pdf/GET";
import _h_invoices_id_mark_sent_post_180 from "./api/invoices/[id]/mark-sent/POST";
import _h_invoices_id_record_payment_post_181 from "./api/invoices/[id]/record-payment/POST";
import _h_invoices_id_void_post_182 from "./api/invoices/[id]/void/POST";
import _h_job_forms_id_delete_183 from "./api/job-forms/[id]/DELETE";
import _h_job_forms_id_get_184 from "./api/job-forms/[id]/GET";
import _h_job_forms_id_put_185 from "./api/job-forms/[id]/PUT";
import _h_job_forms_id_reset_post_186 from "./api/job-forms/[id]/reset/POST";
import _h_job_forms_id_share_delete_187 from "./api/job-forms/[id]/share/DELETE";
import _h_job_forms_id_share_get_188 from "./api/job-forms/[id]/share/GET";
import _h_job_forms_id_share_post_189 from "./api/job-forms/[id]/share/POST";
import _h_me_get_237 from "./api/me/GET";
import _h_me_put_238 from "./api/me/PUT";
import _h_me_2fa_disable_post_239 from "./api/me/2fa/disable/POST";
import _h_me_2fa_enable_post_240 from "./api/me/2fa/enable/POST";
import _h_me_2fa_setup_get_241 from "./api/me/2fa/setup/GET";
import _h_me_2fa_status_get_242 from "./api/me/2fa/status/GET";
import _h_me_2fa_verify_post_243 from "./api/me/2fa/verify/POST";
import _h_me_change_password_post_244 from "./api/me/change-password/POST";
import _h_me_email_status_get_245 from "./api/me/email-status/GET";
import _h_me_phone_get_246 from "./api/me/phone/GET";
import _h_me_phone_put_247 from "./api/me/phone/PUT";
import _h_migrate_account_recovery_post_248 from "./api/migrate-account-recovery/POST";
import _h_migrate_company_settings_post_249 from "./api/migrate-company-settings/POST";
import _h_migrate_dazza_audit_post_250 from "./api/migrate-dazza-audit/POST";
import _h_migrate_dazza_knowledge_post_251 from "./api/migrate-dazza-knowledge/POST";
import _h_migrate_estimates_post_252 from "./api/migrate-estimates/POST";
import _h_migrate_estimating_library_post_253 from "./api/migrate-estimating-library/POST";
import _h_migrate_files_post_254 from "./api/migrate-files/POST";
import _h_migrate_fleet_post_255 from "./api/migrate-fleet/POST";
import _h_migrate_fleet_driver_sessions_post_256 from "./api/migrate-fleet-driver-sessions/POST";
import _h_migrate_form_fields_post_257 from "./api/migrate-form-fields/POST";
import _h_migrate_form_logic_post_258 from "./api/migrate-form-logic/POST";
import _h_migrate_form_templates_post_259 from "./api/migrate-form-templates/POST";
import _h_migrate_job_forms_post_260 from "./api/migrate-job-forms/POST";
import _h_migrate_job_photos_post_261 from "./api/migrate-job-photos/POST";
import _h_migrate_job_tabs_post_262 from "./api/migrate-job-tabs/POST";
import _h_migrate_jobs_post_263 from "./api/migrate-jobs/POST";
import _h_migrate_notifications_post_264 from "./api/migrate-notifications/POST";
import _h_migrate_owner_console_post_265 from "./api/migrate-owner-console/POST";
import _h_migrate_owner_role_post_266 from "./api/migrate-owner-role/POST";
import _h_migrate_pdf_settings_post_267 from "./api/migrate-pdf-settings/POST";
import _h_migrate_safety_post_268 from "./api/migrate-safety/POST";
import _h_migrate_starter_pack_post_269 from "./api/migrate-starter-pack/POST";
import _h_migrate_subscriptions_post_270 from "./api/migrate-subscriptions/POST";
import _h_migrate_support_mode_post_271 from "./api/migrate-support-mode/POST";
import _h_migrate_takeoff_pad_post_272 from "./api/migrate-takeoff-pad/POST";
import _h_migrate_team_post_273 from "./api/migrate-team/POST";
import _h_notifications_alerts_get_274 from "./api/notifications/alerts/GET";
import _h_notifications_prefs_get_275 from "./api/notifications/prefs/GET";
import _h_notifications_prefs_put_276 from "./api/notifications/prefs/PUT";
import _h_notifications_read_post_277 from "./api/notifications/read/POST";
import _h_owner_console_activity_get_278 from "./api/owner-console/activity/GET";
import _h_owner_console_cancellation_feedback_get_279 from "./api/owner-console/cancellation-feedback/GET";
import _h_owner_console_companies_get_280 from "./api/owner-console/companies/GET";
import _h_owner_console_companies_post_281 from "./api/owner-console/companies/POST";
import _h_owner_console_companies_usage_get_282 from "./api/owner-console/companies/usage/GET";
import _h_owner_console_companies_id_limits_put_283 from "./api/owner-console/companies/[id]/limits/PUT";
import _h_owner_console_form_templates_get_284 from "./api/owner-console/form-templates/GET";
import _h_owner_console_form_templates_post_285 from "./api/owner-console/form-templates/POST";
import _h_owner_console_starter_pack_get_286 from "./api/owner-console/starter-pack/GET";
import _h_owner_console_starter_pack_post_287 from "./api/owner-console/starter-pack/POST";
import _h_owner_console_stats_get_288 from "./api/owner-console/stats/GET";
import _h_owner_console_storage_get_289 from "./api/owner-console/storage/GET";
import _h_owner_console_system_ai_builtin_checks_post_290 from "./api/owner-console/system-ai/builtin-checks/POST";
import _h_owner_console_users_get_291 from "./api/owner-console/users/GET";
import _h_owner_console_users_verify_post_292 from "./api/owner-console/users/verify/POST";
import _h_plan_manager_drawings_get_293 from "./api/plan-manager/drawings/GET";
import _h_plan_manager_drawings_post_294 from "./api/plan-manager/drawings/POST";
import _h_plan_manager_drawings_id_get_295 from "./api/plan-manager/drawings/[id]/GET";
import _h_plan_manager_drawings_id_annotations_put_296 from "./api/plan-manager/drawings/[id]/annotations/PUT";
import _h_plan_manager_drawings_id_archive_post_297 from "./api/plan-manager/drawings/[id]/archive/POST";
import _h_plan_manager_drawings_id_job_links_post_298 from "./api/plan-manager/drawings/[id]/job-links/POST";
import _h_plan_manager_drawings_id_pages_pageno_annotations_get_299 from "./api/plan-manager/drawings/[id]/pages/[pageNo]/annotations/GET";
import _h_plan_manager_drawings_id_permanent_delete_300 from "./api/plan-manager/drawings/[id]/permanent/DELETE";
import _h_plan_manager_drawings_id_restore_post_301 from "./api/plan-manager/drawings/[id]/restore/POST";
import _h_plan_manager_drawings_id_revisions_post_302 from "./api/plan-manager/drawings/[id]/revisions/POST";
import _h_plan_manager_drawings_id_revisions_revisionid_finalize_post_303 from "./api/plan-manager/drawings/[id]/revisions/[revisionId]/finalize/POST";
import _h_plan_manager_drawings_id_upload_post_304 from "./api/plan-manager/drawings/[id]/upload/POST";
import _h_plan_manager_share_post_305 from "./api/plan-manager/share/POST";
import _h_plan_manager_share_validate_get_306 from "./api/plan-manager/share/validate/GET";
import _h_public_form_token_get_307 from "./api/public/form/[token]/GET";
import _h_public_form_token_submit_post_308 from "./api/public/form/[token]/submit/POST";
import _h_public_swms_token_get_309 from "./api/public/swms/[token]/GET";
import _h_public_swms_token_signoff_post_310 from "./api/public/swms/[token]/signoff/POST";
import _h_recipes_get_311 from "./api/recipes/GET";
import _h_recipes_post_312 from "./api/recipes/POST";
import _h_recipes_id_delete_313 from "./api/recipes/[id]/DELETE";
import _h_recipes_id_put_314 from "./api/recipes/[id]/PUT";
import _h_scheduler_crew_get_354 from "./api/scheduler/crew/GET";
import _h_scheduler_jobs_get_355 from "./api/scheduler/jobs/GET";
import _h_scheduler_jobs_id_reschedule_patch_356 from "./api/scheduler/jobs/[id]/reschedule/PATCH";
import _h_secure_share_get_357 from "./api/secure-share/GET";
import _h_secure_share_post_358 from "./api/secure-share/POST";
import _h_secure_share_id_delete_359 from "./api/secure-share/[id]/DELETE";
import _h_secure_share_token_get_360 from "./api/secure-share/[token]/GET";
import _h_secure_share_token_post_361 from "./api/secure-share/[token]/POST";
import _h_share_token_get_381 from "./api/share/[token]/GET";
import _h_signup_post_382 from "./api/signup/POST";
import _h_stripe_create_checkout_session_post_383 from "./api/stripe/create-checkout-session/POST";
import _h_stripe_session_sessionid_get_384 from "./api/stripe/session/[sessionId]/GET";
import _h_subscription_create_checkout_post_385 from "./api/subscription/create-checkout/POST";
import _h_subscription_status_get_386 from "./api/subscription/status/GET";
import _h_subscription_webhook_post_387 from "./api/subscription/webhook/POST";
import _h_support_mode_audit_get_388 from "./api/support-mode/audit/GET";
import _h_support_mode_checklist_get_389 from "./api/support-mode/checklist/GET";
import _h_support_mode_checklist_put_390 from "./api/support-mode/checklist/PUT";
import _h_support_mode_enter_post_391 from "./api/support-mode/enter/POST";
import _h_support_mode_exit_post_392 from "./api/support-mode/exit/POST";
import _h_support_mode_status_get_393 from "./api/support-mode/status/GET";
import _h_takeoff_pad_get_394 from "./api/takeoff-pad/GET";
import _h_takeoff_pad_put_395 from "./api/takeoff-pad/PUT";
import _h_team_get_396 from "./api/team/GET";
import _h_team_invite_post_397 from "./api/team/invite/POST";
import _h_team_invites_get_398 from "./api/team/invites/GET";
import _h_team_invites_post_399 from "./api/team/invites/POST";
import _h_team_invites_id_cancel_post_400 from "./api/team/invites/[id]/cancel/POST";
import _h_team_invites_id_resend_post_401 from "./api/team/invites/[id]/resend/POST";
import _h_team_members_get_402 from "./api/team/members/GET";
import _h_team_resend_verification_post_403 from "./api/team/resend-verification/POST";
import _h_team_verify_user_post_404 from "./api/team/verify-user/POST";
import _h_team_id_delete_405 from "./api/team/[id]/DELETE";
import _h_team_id_put_406 from "./api/team/[id]/PUT";
import _h_usage_get_407 from "./api/usage/GET";
// </api-imports>
import { seoRoutes } from "../lib/seo-routes";
import { requireOwner, requireAdmin, isPublicRoute } from "./lib/auth-middleware.js";
import { getAuth } from "../lib/auth/auth.js";
import { applyWriteGate } from "./lib/write-gate-apply.js";
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
	// result.html and result.head come from React's renderToString — trusted
	// server-rendered markup, not user-supplied input.
	// eslint-disable-next-line no-unsanitized/method
	return template
		.replace("<!--app-head-->", () => head)
		// eslint-disable-next-line no-unsanitized/method
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

// ── Harden Express defaults ───────────────────────────────────────────────────
// Remove the "X-Powered-By: Express" fingerprint header
app.disable('x-powered-by');

// Honour x-forwarded-* from the load balancer so req.protocol/req.hostname
// reflect the public-facing values. Express-maintained parsing respects the
// existing trust-proxy config; direct header reads would let a client spoof
// the sitemap origin in robots.txt.
app.set("trust proxy", true);

// ── HTTPS enforcement ─────────────────────────────────────────────────────────
// Redirect any plain HTTP request to HTTPS in production.
// The load balancer sets x-forwarded-proto; trust proxy is enabled above.
app.use((req: Request, res: Response, next: NextFunction) => {
  if (
    process.env.NODE_ENV === 'production' &&
    req.headers['x-forwarded-proto'] === 'http'
  ) {
    return res.redirect(301, `https://${req.hostname}${req.originalUrl}`);
  }
  next();
});

// ── Body size limits ──────────────────────────────────────────────────────────
// Tighten JSON / urlencoded body limits to prevent large-payload DoS.
// File uploads use multer (memoryStorage) with its own 20 MB limit.
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// ── Security headers ──────────────────────────────────────────────────────────
app.use((_req: Request, res: Response, next: NextFunction) => {
  // Prevent clickjacking — allow same-origin framing (needed for builder preview iframe)
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  // Prevent MIME-type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Force HTTPS for 1 year (including subdomains)
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  // Referrer policy — don't leak full URL to third parties
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Permissions policy — disable unused browser features
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=()');
  // Disable DNS prefetching to reduce info leakage
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  // COOP: same-origin-allow-popups — allows Stripe, Xero, QBO OAuth popups to
  // communicate back while still isolating the browsing context from unrelated openers.
  // 'same-origin' would break OAuth redirect flows that open in a popup.
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  // CORP: cross-origin — allows the builder preview iframe (different origin) to
  // load assets served by this app. 'same-origin' blocks the preview entirely.
  // NOTE: COEP (require-corp) is intentionally omitted — this app does not use
  // SharedArrayBuffer or high-res timers, so the COOP/COEP pair is not needed.
  // Adding COEP would require every third-party resource (Google Fonts, Stripe JS,
  // CDN assets) to opt in with CORP headers, which most do not send.
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  // CSP — same-origin + trusted third parties only
  // connect-src includes R2 public URL if configured
  const r2PublicUrl = process.env.R2_PUBLIC_URL ? process.env.R2_PUBLIC_URL.replace(/\/$/, '') : null;
  const connectSrc = [
    "'self'",
    'https://api.stripe.com',
    'https://login.xero.com',
    'https://api.xero.com',
    // Allow WebSocket connections for Vite HMR in dev
    ...(import.meta.env.PROD ? [] : ['ws:', 'wss:']),
    ...(r2PublicUrl ? [r2PublicUrl] : []),
  ].join(' ');
  // In production: drop unsafe-eval (only needed by Vite HMR in dev).
  // In dev: keep it so the Vite client and React refresh work correctly.
  const scriptSrc = import.meta.env.PROD
    ? `script-src 'self' 'unsafe-inline' https://js.stripe.com`
    : `script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com`;
  // frame-ancestors: allow the GoDaddy builder iframe to embed this app in preview.
  // In production this is same-origin only (no builder iframe needed).
  const frameAncestors = import.meta.env.PROD
    ? "frame-ancestors 'self'"
    : "frame-ancestors 'self' https://*.airoapp.ai https://*.godaddy.com";
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      scriptSrc,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob: https:",
      `connect-src ${connectSrc}`,
      "frame-src https://js.stripe.com https://hooks.stripe.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      frameAncestors,
      "upgrade-insecure-requests",
    ].join('; ')
  );
  next();
});

// ── Global API rate limiting ───────────────────────────────────────────────────
// Applied before auth guard so even unauthenticated flood attempts are throttled.
// Auth routes get a tighter sub-limit on top of the global one.
app.use('/api', globalApiLimiter);
app.use('/api/auth', authApiLimiter);

// ── API catch-all authentication guard ───────────────────────────────────────
// Every /api/* request must be authenticated UNLESS it is on the public
// whitelist (auth routes, signup, Stripe webhook, health check).
// This is a defence-in-depth layer — individual handlers also check auth,
// but this guard ensures no new endpoint can accidentally be left open.
app.use('/api', async (req: Request, res: Response, next: NextFunction) => {
  // Let public routes through immediately
  if (isPublicRoute(req.method, req.path.startsWith('/') ? `/api${req.path}` : `/api/${req.path}`)) {
    return next();
  }
  // Check session
  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) {
      return res.status(401).json({ error: 'Unauthorised' });
    }
    next();
  } catch {
    return res.status(401).json({ error: 'Unauthorised' });
  }
});

// ── View-only write gate ───────────────────────────────────────────────────────
// Blocks create/update/delete/upload for companies in trial_expired, past_due,
// cancelled, or suspended state.  Reads, downloads, billing, and auth are exempt.
// Must be registered AFTER the auth guard and BEFORE route handlers.
applyWriteGate(app);

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

  // 1b. Ensure notifications table exists (must be before column migrations below)
  try {
    await db.execute(sql.raw(
      "CREATE TABLE IF NOT EXISTS notifications (" +
      "  id          INT AUTO_INCREMENT PRIMARY KEY," +
      "  company_id  INT NOT NULL," +
      "  user_id     VARCHAR(36) NOT NULL," +
      "  type        VARCHAR(60) NOT NULL," +
      "  title       VARCHAR(255) NOT NULL," +
      "  body        TEXT NULL," +
      "  link        VARCHAR(500) NULL," +
      "  is_read     TINYINT(1) NOT NULL DEFAULT 0," +
      "  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP," +
      "  INDEX idx_company_user (company_id, user_id)," +
      "  INDEX idx_user_read (user_id, is_read)" +
      ")"
    ));
    console.log('[startup-migration] notifications table ready');
  } catch (e: unknown) {
    const msg = String((e as Error)?.message ?? e);
    if (!msg.includes('already exists') && !msg.includes('ER_TABLE_EXISTS')) {
      console.warn('[startup-migration] notifications CREATE failed:', msg);
    }
  }

  // 1c. Ensure platform_activity_log exists BEFORE colsToEnsure runs so the
  //     column-healing loop can add any missing columns on older DBs.
  try {
    await db.execute(sql.raw(
      "CREATE TABLE IF NOT EXISTS platform_activity_log (" +
      "  id INT AUTO_INCREMENT PRIMARY KEY," +
      "  event_type VARCHAR(60) NOT NULL DEFAULT ''," +
      "  success TINYINT(1) NOT NULL DEFAULT 1," +
      "  user_id VARCHAR(36) NULL," +
      "  email VARCHAR(255) NULL," +
      "  company_id INT NULL," +
      "  performed_by_user_id VARCHAR(36) NULL," +
      "  ip_address VARCHAR(100) NULL," +
      "  user_agent VARCHAR(500) NULL," +
      "  reason VARCHAR(500) NULL," +
      "  metadata_json TEXT NULL," +
      "  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP," +
      "  INDEX idx_company (company_id)," +
      "  INDEX idx_user (user_id)," +
      "  INDEX idx_event (event_type)," +
      "  INDEX idx_created (created_at)" +
      ")"
    ));
    console.log('[startup-migration] platform_activity_log table ready');
  } catch (e: unknown) {
    const msg = String((e as Error)?.message ?? e);
    if (!msg.includes('already exists') && !msg.includes('ER_TABLE_EXISTS')) {
      console.warn('[startup-migration] platform_activity_log CREATE failed:', msg);
    }
  }

  // 2. Ensure individual columns exist — check INFORMATION_SCHEMA first, then ALTER
  const colsToEnsure: Array<{ table: string; column: string; definition: string }> = [
    { table: 'profiles',         column: 'notification_prefs', definition: 'TEXT NULL' },
    { table: 'profiles',         column: 'last_login_at',      definition: 'DATETIME NULL' },
    { table: 'profiles',         column: 'last_active_at',     definition: 'DATETIME NULL' },
    // Email verification on BetterAuth user table
    { table: 'user',             column: 'email_verified',     definition: 'BOOLEAN NOT NULL DEFAULT FALSE' },
    { table: 'company_settings', column: 'pdf_json',                  definition: 'LONGTEXT NULL' },
    { table: 'company_settings', column: 'backup_json',               definition: 'LONGTEXT NULL' },
    { table: 'company_settings', column: 'last_backup_at',            definition: 'DATETIME NULL' },
    { table: 'company_settings', column: 'custom_limits_json',        definition: 'LONGTEXT NULL' },
    { table: 'company_settings', column: 'retention_json',            definition: 'LONGTEXT NULL' },
    { table: 'company_settings', column: 'backup_destination_json',      definition: 'LONGTEXT NULL' },
    { table: 'company_settings', column: 'file_transfer_backup_json',   definition: 'LONGTEXT NULL' },
    { table: 'company_settings', column: 'work_label_singular',       definition: "VARCHAR(60) NULL" },
    { table: 'company_settings', column: 'work_label_plural',         definition: "VARCHAR(60) NULL" },
    // Subscription columns
    { table: 'companies', column: 'plan',                   definition: "VARCHAR(30) NOT NULL DEFAULT 'trial'" },
    { table: 'companies', column: 'subscription_status',    definition: "VARCHAR(30) NOT NULL DEFAULT 'trial'" },
    { table: 'companies', column: 'trial_ends_at',          definition: 'DATETIME NULL' },
    { table: 'companies', column: 'stripe_customer_id',     definition: 'VARCHAR(100) NULL' },
    { table: 'companies', column: 'stripe_subscription_id', definition: 'VARCHAR(100) NULL' },
    { table: 'companies', column: 'stripe_price_id',        definition: 'VARCHAR(100) NULL' },
    { table: 'companies', column: 'max_users',              definition: 'INT NOT NULL DEFAULT 1' },
    // Cancellation / past-due tracking
    { table: 'companies', column: 'cancelled_at',           definition: 'DATETIME NULL' },
    { table: 'companies', column: 'past_due_since',         definition: 'DATETIME NULL' },
    // Scheduler columns on jobs
    { table: 'jobs', column: 'start_date',                  definition: 'DATE NULL' },
    { table: 'jobs', column: 'finish_date',                 definition: 'DATE NULL' },
    { table: 'jobs', column: 'supervisor_user_id',          definition: 'VARCHAR(36) NULL' },
    { table: 'jobs', column: 'crew_name',                   definition: 'VARCHAR(255) NULL' },
    { table: 'jobs', column: 'progress',                    definition: 'INT NOT NULL DEFAULT 0' },
    // Scheduler v2 — explicit scheduled vs actual dates
    { table: 'jobs', column: 'scheduled_start_date',        definition: 'DATE NULL' },
    { table: 'jobs', column: 'expected_completion_date',    definition: 'DATE NULL' },
    { table: 'jobs', column: 'actual_start_date',           definition: 'DATE NULL' },
    { table: 'jobs', column: 'actual_completion_date',      definition: 'DATE NULL' },
    { table: 'jobs', column: 'assigned_supervisor_user_id', definition: 'VARCHAR(36) NULL' },
    { table: 'jobs', column: 'assigned_team_label',         definition: 'VARCHAR(255) NULL' },
    // ── swms_templates: extended fields (v2) ──────────────────────────────────
    { table: 'swms_templates', column: 'category',              definition: 'VARCHAR(100) NULL' },
    { table: 'swms_templates', column: 'purpose_scope',         definition: 'TEXT NULL' },
    { table: 'swms_templates', column: 'critical_risks',        definition: 'TEXT NULL' },
    { table: 'swms_templates', column: 'mandatory_controls',    definition: 'TEXT NULL' },
    { table: 'swms_templates', column: 'hazard_identification', definition: 'TEXT NULL' },
    { table: 'swms_templates', column: 'high_risk_work',        definition: 'TEXT NULL' },
    { table: 'swms_templates', column: 'ppe_requirements',      definition: 'TEXT NULL' },
    { table: 'swms_templates', column: 'risk_rating',           definition: 'TEXT NULL' },
    { table: 'swms_templates', column: 'sequence_controls',     definition: 'TEXT NULL' },
    { table: 'swms_templates', column: 'permits_approvals',     definition: 'TEXT NULL' },
    { table: 'swms_templates', column: 'monitoring_review',     definition: 'TEXT NULL' },
    { table: 'swms_templates', column: 'notes',                 definition: 'TEXT NULL' },
    { table: 'swms_templates', column: 'source_file_id',        definition: 'INT NULL' },
    // ── job_swms: full document store (v2 — was thin join table) ─────────────
    { table: 'job_swms', column: 'template_id',            definition: 'INT NULL' },
    { table: 'job_swms', column: 'title',                  definition: "VARCHAR(255) NOT NULL DEFAULT ''" },
    { table: 'job_swms', column: 'category',               definition: 'VARCHAR(100) NULL' },
    { table: 'job_swms', column: 'work_activity',          definition: 'TEXT NULL' },
    { table: 'job_swms', column: 'purpose_scope',          definition: 'TEXT NULL' },
    { table: 'job_swms', column: 'critical_risks',         definition: 'TEXT NULL' },
    { table: 'job_swms', column: 'mandatory_controls',     definition: 'TEXT NULL' },
    { table: 'job_swms', column: 'hazard_identification',  definition: 'TEXT NULL' },
    { table: 'job_swms', column: 'high_risk_work',         definition: 'TEXT NULL' },
    { table: 'job_swms', column: 'ppe_requirements',       definition: 'TEXT NULL' },
    { table: 'job_swms', column: 'risk_rating',            definition: 'TEXT NULL' },
    { table: 'job_swms', column: 'sequence_controls',      definition: 'TEXT NULL' },
    { table: 'job_swms', column: 'hazards',                definition: 'TEXT NULL' },
    { table: 'job_swms', column: 'risks',                  definition: 'TEXT NULL' },
    { table: 'job_swms', column: 'controls',               definition: 'TEXT NULL' },
    { table: 'job_swms', column: 'ppe',                    definition: 'TEXT NULL' },
    { table: 'job_swms', column: 'plant_equipment',        definition: 'TEXT NULL' },
    { table: 'job_swms', column: 'training_competency',    definition: 'TEXT NULL' },
    { table: 'job_swms', column: 'emergency_controls',     definition: 'TEXT NULL' },
    { table: 'job_swms', column: 'environmental_controls', definition: 'TEXT NULL' },
    { table: 'job_swms', column: 'sign_off_requirements',  definition: 'TEXT NULL' },
    { table: 'job_swms', column: 'permits_approvals',      definition: 'TEXT NULL' },
    { table: 'job_swms', column: 'monitoring_review',      definition: 'TEXT NULL' },
    { table: 'job_swms', column: 'notes',                  definition: 'TEXT NULL' },
    { table: 'job_swms', column: 'revision_number',        definition: "VARCHAR(20) NOT NULL DEFAULT '1'" },
    { table: 'job_swms', column: 'review_date',            definition: 'DATE NULL' },
    { table: 'job_swms', column: 'status',                 definition: "VARCHAR(30) NOT NULL DEFAULT 'draft'" },
    { table: 'job_swms', column: 'reviewed_by_user_id',    definition: 'VARCHAR(36) NULL' },
    { table: 'job_swms', column: 'reviewed_at',            definition: 'DATETIME NULL' },
    { table: 'job_swms', column: 'approved_by_user_id',    definition: 'VARCHAR(36) NULL' },
    { table: 'job_swms', column: 'approved_at',            definition: 'DATETIME NULL' },
    // ── jobs: customer link (v2) ──────────────────────────────────────────────
    { table: 'jobs', column: 'customer_id', definition: 'INT NULL' },
    // ── profiles: invoices permission ────────────────────────────────────────
    { table: 'profiles', column: 'perm_invoices', definition: "TINYINT(1) NOT NULL DEFAULT 1" },
    // ── customers: Xero contact ID ────────────────────────────────────────────
    { table: 'customers', column: 'xero_contact_id', definition: "VARCHAR(100) NULL" },
    // ── user: TOTP 2FA ────────────────────────────────────────────────────────
    { table: 'user', column: 'totp_secret',        definition: 'VARCHAR(64) NULL' },
    { table: 'user', column: 'two_factor_enabled', definition: 'TINYINT(1) NOT NULL DEFAULT 0' },
    // ── Dazza AI — per-company OpenAI key ────────────────────────────────────
    { table: 'company_settings', column: 'openai_api_key',      definition: 'TEXT NULL' },
    // ── Xero — per-company OAuth config (shelved; columns kept for schema continuity) ──
    // NOTE: these columns are intentionally not referenced by any active route while
    // the accounting integrations are shelved. Re-enable when unshelving.
    { table: 'company_settings', column: 'xero_oauth_config',   definition: 'TEXT NULL' },
    // ── Customers: contractor fields ─────────────────────────────────────────
    { table: 'customers', column: 'record_type',    definition: "VARCHAR(20) NOT NULL DEFAULT 'customer'" },
    { table: 'customers', column: 'trade_type',     definition: 'VARCHAR(100) NULL' },
    { table: 'customers', column: 'licence_number', definition: 'VARCHAR(100) NULL' },
    // ── job_progress_lines: assignment fields ─────────────────────────────────
    { table: 'job_progress_lines', column: 'assignment_type',  definition: "VARCHAR(20) NULL" },
    { table: 'job_progress_lines', column: 'assigned_to_name', definition: 'VARCHAR(255) NULL' },
    { table: 'job_progress_lines', column: 'contractor_id',    definition: 'INT NULL' },
    { table: 'job_progress_lines', column: 'trade_type',       definition: 'VARCHAR(100) NULL' },
    // ── job_form_submissions: external share fields ───────────────────────────
    { table: 'job_form_submissions', column: 'submitted_at',              definition: 'DATETIME NULL' },
    { table: 'job_form_submissions', column: 'external_submitter_name',   definition: 'VARCHAR(255) NULL' },
    { table: 'job_form_submissions', column: 'external_submitter_email',  definition: 'VARCHAR(255) NULL' },
    // notifications table: link column
    { table: 'notifications', column: 'link', definition: 'VARCHAR(500) NULL' },
    // ── swms_signoffs: extended sign-on fields ────────────────────────────────
    { table: 'swms_signoffs', column: 'company_name', definition: 'VARCHAR(255) NULL' },
    { table: 'swms_signoffs', column: 'role',         definition: 'VARCHAR(100) NULL' },
    // ── Company branding ──────────────────────────────────────────────────────
    // logo_url: path to uploaded company logo for PDF branding
    { table: 'companies', column: 'logo_url', definition: 'VARCHAR(500) NULL' },
    // ── Account recovery support tools ───────────────────────────────────────
    // must_change_password: set by developer; forces user to set new password on next login
    { table: 'user', column: 'must_change_password',     definition: 'TINYINT(1) NOT NULL DEFAULT 0' },
    // temp_password_hash: bcrypt hash of one-time temp password; cleared after use
    { table: 'user', column: 'temp_password_hash',       definition: 'TEXT NULL' },
    // lockout_until: set when too many failed password attempts; cleared by developer
    { table: 'user', column: 'lockout_until',            definition: 'DATETIME NULL' },
    // failed_login_attempts: counter for password lockout (separate from PIN)
    { table: 'user', column: 'failed_login_attempts',    definition: 'INT NOT NULL DEFAULT 0' },
    // ── Fleet assets: VIN ────────────────────────────────────────────────────
    { table: 'fleet_assets', column: 'vin', definition: 'VARCHAR(50) NULL' },
    // ── Fleet assets: odometer tracking ──────────────────────────────────────
    { table: 'fleet_assets', column: 'current_odometer_km', definition: 'INT NULL' },
    // ── Invoice immutability lock ─────────────────────────────────────────────
    { table: 'invoices', column: 'locked',     definition: 'TINYINT(1) NOT NULL DEFAULT 0' },
    { table: 'invoices', column: 'locked_at',  definition: 'DATETIME NULL' },
    { table: 'invoices', column: 'locked_by',  definition: 'VARCHAR(255) NULL' },
    { table: 'invoices', column: 'pdf_url',    definition: 'VARCHAR(500) NULL' },
    // ── Accounting provider columns (QBO + MYOB) ─────────────────────────────
    { table: 'invoices', column: 'qbo_invoice_id',      definition: 'VARCHAR(255) NULL' },
    { table: 'invoices', column: 'qbo_sync_status',     definition: "VARCHAR(30) NULL DEFAULT 'not_synced'" },
    { table: 'invoices', column: 'qbo_sync_error',      definition: 'TEXT NULL' },
    { table: 'invoices', column: 'myob_invoice_uid',    definition: 'VARCHAR(255) NULL' },
    { table: 'invoices', column: 'myob_sync_status',    definition: "VARCHAR(30) NULL DEFAULT 'not_synced'" },
    { table: 'invoices', column: 'myob_sync_error',     definition: 'TEXT NULL' },
    // ── Job cost ledger immutability ──────────────────────────────────────────
    { table: 'job_cost_ledger', column: 'locked',            definition: 'TINYINT(1) NOT NULL DEFAULT 0' },
    { table: 'job_cost_ledger', column: 'locked_at',         definition: 'DATETIME NULL' },
    { table: 'job_cost_ledger', column: 'original_entry_id', definition: 'INT NULL' },
    { table: 'job_cost_ledger', column: 'is_correction',     definition: 'TINYINT(1) NOT NULL DEFAULT 0' },
    // ── QBO company connection ────────────────────────────────────────────────
    // ── MYOB company connection ───────────────────────────────────────────────
    // ── Document Builder ─────────────────────────────────────────────────────
    // (tables created via CREATE TABLE IF NOT EXISTS below; no extra columns needed at launch)
    // ── platform_activity_log: self-heal all columns ─────────────────────────
    // The table is created via CREATE TABLE IF NOT EXISTS in the startup block
    // below, but columns added after initial creation won't exist in older DBs.
    // List every non-PK, non-auto column here so they're added on next boot.
    { table: 'platform_activity_log', column: 'event_type',           definition: "VARCHAR(60) NOT NULL DEFAULT ''" },
    { table: 'platform_activity_log', column: 'success',              definition: 'TINYINT(1) NOT NULL DEFAULT 1' },
    { table: 'platform_activity_log', column: 'user_id',              definition: 'VARCHAR(36) NULL' },
    { table: 'platform_activity_log', column: 'email',                definition: 'VARCHAR(255) NULL' },
    { table: 'platform_activity_log', column: 'company_id',           definition: 'INT NULL' },
    { table: 'platform_activity_log', column: 'performed_by_user_id', definition: 'VARCHAR(36) NULL' },
    { table: 'platform_activity_log', column: 'ip_address',           definition: 'VARCHAR(100) NULL' },
    { table: 'platform_activity_log', column: 'user_agent',           definition: 'VARCHAR(500) NULL' },
    { table: 'platform_activity_log', column: 'reason',               definition: 'VARCHAR(500) NULL' },
    { table: 'platform_activity_log', column: 'metadata_json',        definition: 'TEXT NULL' },
    { table: 'platform_activity_log', column: 'created_at',           definition: 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP' },
  ];
  for (const { table, column, definition } of colsToEnsure) {
    try {
      // First confirm the table itself exists — if not, skip silently
      const [tableRows] = await db.execute(
        sql`SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${table}`
      ) as unknown as [Array<{ cnt: number }>, unknown];
      if (Number(tableRows?.[0]?.cnt ?? 0) === 0) continue;

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

  // Safety module tables (idempotent)
  const safetyTables = [
    { name: 'swms_templates', ddl: "CREATE TABLE IF NOT EXISTS swms_templates (id INT AUTO_INCREMENT PRIMARY KEY, company_id INT NOT NULL, title VARCHAR(255) NOT NULL, work_activity TEXT NULL, hazards TEXT NULL, risks TEXT NULL, controls TEXT NULL, ppe TEXT NULL, plant_equipment TEXT NULL, training_competency TEXT NULL, emergency_controls TEXT NULL, environmental_controls TEXT NULL, sign_off_requirements TEXT NULL, revision_number VARCHAR(20) NOT NULL DEFAULT '1', review_date DATE NULL, status VARCHAR(30) NOT NULL DEFAULT 'draft', created_by_user_id VARCHAR(36) NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX idx_company (company_id))" },
    { name: 'safety_plans', ddl: "CREATE TABLE IF NOT EXISTS safety_plans (id INT AUTO_INCREMENT PRIMARY KEY, company_id INT NOT NULL, job_id INT NULL, title VARCHAR(255) NOT NULL, project_value DECIMAL(15,2) NULL, is_principal_contractor TINYINT(1) NOT NULL DEFAULT 0, site_address TEXT NULL, site_supervisor VARCHAR(255) NULL, first_aid_officer VARCHAR(255) NULL, emergency_contact TEXT NULL, nearest_hospital VARCHAR(255) NULL, emergency_assembly_point TEXT NULL, evacuation_notes TEXT NULL, site_rules TEXT NULL, high_risk_activities TEXT NULL, required_posters TEXT NULL, status VARCHAR(30) NOT NULL DEFAULT 'draft', created_by_user_id VARCHAR(36) NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX idx_company (company_id), INDEX idx_job (job_id))" },
    { name: 'job_swms', ddl: "CREATE TABLE IF NOT EXISTS job_swms (id INT AUTO_INCREMENT PRIMARY KEY, company_id INT NOT NULL, job_id INT NOT NULL, swms_template_id INT NOT NULL, assigned_by_user_id VARCHAR(36) NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX idx_company (company_id), INDEX idx_job (job_id))" },
    { name: 'swms_signoffs', ddl: "CREATE TABLE IF NOT EXISTS swms_signoffs (id INT AUTO_INCREMENT PRIMARY KEY, job_swms_id INT NOT NULL, company_id INT NOT NULL, worker_name VARCHAR(255) NOT NULL, white_card_number VARCHAR(100) NULL, signature_data LONGTEXT NULL, signed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX idx_job_swms (job_swms_id), INDEX idx_company (company_id))" },
    { name: 'safety_documents', ddl: "CREATE TABLE IF NOT EXISTS safety_documents (id INT AUTO_INCREMENT PRIMARY KEY, company_id INT NOT NULL, title VARCHAR(255) NOT NULL, doc_type VARCHAR(60) NOT NULL DEFAULT 'policy', original_name VARCHAR(255) NOT NULL, stored_name VARCHAR(255) NOT NULL, mime_type VARCHAR(100) NOT NULL, size_bytes INT NOT NULL DEFAULT 0, review_date DATE NULL, notes TEXT NULL, uploaded_by_user_id VARCHAR(36) NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX idx_company (company_id))" },
    { name: 'safety_posters', ddl: "CREATE TABLE IF NOT EXISTS safety_posters (id INT AUTO_INCREMENT PRIMARY KEY, company_id INT NOT NULL, title VARCHAR(255) NOT NULL, poster_type VARCHAR(60) NOT NULL DEFAULT 'general', original_name VARCHAR(255) NOT NULL, stored_name VARCHAR(255) NOT NULL, mime_type VARCHAR(100) NOT NULL, size_bytes INT NOT NULL DEFAULT 0, notes TEXT NULL, uploaded_by_user_id VARCHAR(36) NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX idx_company (company_id))" },
    { name: 'safety_generated_posters', ddl: "CREATE TABLE IF NOT EXISTS safety_generated_posters (id INT AUTO_INCREMENT PRIMARY KEY, company_id INT NOT NULL, poster_type VARCHAR(60) NOT NULL, title VARCHAR(255) NOT NULL, data_json LONGTEXT NOT NULL, created_by_user_id VARCHAR(36) NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX idx_company (company_id))" },
    { name: 'safety_registers', ddl: "CREATE TABLE IF NOT EXISTS safety_registers (id INT AUTO_INCREMENT PRIMARY KEY, company_id INT NOT NULL, register_type VARCHAR(60) NOT NULL, title VARCHAR(255) NOT NULL, data_json LONGTEXT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX idx_company (company_id))" },
    { name: 'job_costs', ddl: "CREATE TABLE IF NOT EXISTS job_costs (id INT AUTO_INCREMENT PRIMARY KEY, company_id INT NOT NULL, job_id INT NOT NULL, user_id VARCHAR(36) NULL, purchase_date DATE NULL, merchant VARCHAR(255) NULL, description TEXT NOT NULL, category VARCHAR(60) NOT NULL DEFAULT 'Other', amount DECIMAL(12,2) NOT NULL DEFAULT 0, gst_included TINYINT(1) NOT NULL DEFAULT 0, gst_amount DECIMAL(12,2) NOT NULL DEFAULT 0, amount_ex_gst DECIMAL(12,2) NOT NULL DEFAULT 0, receipt_file_id INT NULL, notes TEXT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX idx_company (company_id), INDEX idx_job (job_id))" },
    { name: 'subscription_cancellation_feedback', ddl: "CREATE TABLE IF NOT EXISTS subscription_cancellation_feedback (id INT AUTO_INCREMENT PRIMARY KEY, company_id INT NOT NULL, user_id VARCHAR(36) NOT NULL, subscription_id VARCHAR(100) NULL, plan VARCHAR(30) NOT NULL DEFAULT 'unknown', reason VARCHAR(100) NULL, comment TEXT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX idx_company (company_id), INDEX idx_user (user_id))" },
    // ── Dazza Brain tables ─────────────────────────────────────────────────────
    { name: 'dazza_brain_entries', ddl: "CREATE TABLE IF NOT EXISTS dazza_brain_entries (id INT AUTO_INCREMENT PRIMARY KEY, company_id INT NOT NULL, title VARCHAR(255) NOT NULL, category VARCHAR(60) NOT NULL DEFAULT 'General', content LONGTEXT NOT NULL, source_label VARCHAR(100) NULL, confidence VARCHAR(20) NULL DEFAULT 'Medium', approved TINYINT(1) NOT NULL DEFAULT 0, active TINYINT(1) NOT NULL DEFAULT 1, approved_by_user_id VARCHAR(36) NULL, usage_count INT NOT NULL DEFAULT 0, last_used_at DATETIME NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX idx_company (company_id), INDEX idx_approved (company_id, approved, active))" },
    { name: 'dazza_hive_pending', ddl: "CREATE TABLE IF NOT EXISTS dazza_hive_pending (id INT AUTO_INCREMENT PRIMARY KEY, company_id INT NOT NULL, user_id VARCHAR(36) NOT NULL, question TEXT NOT NULL, suggested_title VARCHAR(255) NOT NULL, suggested_content LONGTEXT NOT NULL, suggested_category VARCHAR(60) NOT NULL DEFAULT 'General', source_type VARCHAR(50) NOT NULL DEFAULT 'openai', status VARCHAR(20) NOT NULL DEFAULT 'pending', reviewed_by_user_id VARCHAR(36) NULL, reviewed_at DATETIME NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX idx_company (company_id), INDEX idx_status (company_id, status))" },
    { name: 'dazza_brain_interactions', ddl: "CREATE TABLE IF NOT EXISTS dazza_brain_interactions (id INT AUTO_INCREMENT PRIMARY KEY, company_id INT NOT NULL, user_id VARCHAR(36) NOT NULL, question_summary VARCHAR(500) NOT NULL, answer_source VARCHAR(50) NOT NULL DEFAULT 'openai', modules_used VARCHAR(255) NULL, confidence_level VARCHAR(20) NULL DEFAULT 'Medium', conflict_detected TINYINT(1) NOT NULL DEFAULT 0, dollars_included TINYINT(1) NOT NULL DEFAULT 0, support_mode TINYINT(1) NOT NULL DEFAULT 0, support_company_id INT NULL, tokens_used INT NOT NULL DEFAULT 0, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX idx_company (company_id), INDEX idx_created (company_id, created_at))" },
    // Legacy audit log — kept for backward compat with auditLog() in chat/POST.ts
    { name: 'dazza_audit_log', ddl: "CREATE TABLE IF NOT EXISTS dazza_audit_log (id INT AUTO_INCREMENT PRIMARY KEY, user_id VARCHAR(36) NOT NULL, company_id INT NOT NULL, question_summary VARCHAR(500) NOT NULL, modules_used VARCHAR(255) NULL, dollars_included TINYINT(1) NOT NULL DEFAULT 0, support_mode TINYINT(1) NOT NULL DEFAULT 0, support_company_id INT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX idx_company (company_id), INDEX idx_user (user_id))" },
    // OneDrive / SharePoint OAuth connections
    { name: 'onedrive_connections', ddl: "CREATE TABLE IF NOT EXISTS onedrive_connections (id INT AUTO_INCREMENT PRIMARY KEY, company_id INT NOT NULL UNIQUE, display_name VARCHAR(255) NOT NULL DEFAULT 'OneDrive User', access_token TEXT NOT NULL, refresh_token TEXT NOT NULL, expires_at DATETIME NOT NULL, connected_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX idx_company (company_id))" },
    // ── Customers ─────────────────────────────────────────────────────────────
    { name: 'customers', ddl: "CREATE TABLE IF NOT EXISTS customers (id INT AUTO_INCREMENT PRIMARY KEY, company_id INT NOT NULL, name VARCHAR(255) NOT NULL, contact_person VARCHAR(255) NULL, email VARCHAR(255) NULL, phone VARCHAR(50) NULL, mobile VARCHAR(50) NULL, address TEXT NULL, billing_address TEXT NULL, abn VARCHAR(20) NULL, notes TEXT NULL, status VARCHAR(30) NOT NULL DEFAULT 'active', created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX idx_company (company_id), INDEX idx_status (company_id, status))" },
    // ── Invoices ──────────────────────────────────────────────────────────────
    { name: 'invoices', ddl: "CREATE TABLE IF NOT EXISTS invoices (id INT AUTO_INCREMENT PRIMARY KEY, company_id INT NOT NULL, job_id INT NULL, customer_id INT NULL, invoice_number VARCHAR(50) NOT NULL, title VARCHAR(255) NOT NULL, status VARCHAR(30) NOT NULL DEFAULT 'draft', issue_date DATE NULL, due_date DATE NULL, subtotal DECIMAL(12,2) NOT NULL DEFAULT 0, gst_amount DECIMAL(12,2) NOT NULL DEFAULT 0, total DECIMAL(12,2) NOT NULL DEFAULT 0, amount_paid DECIMAL(12,2) NOT NULL DEFAULT 0, balance_due DECIMAL(12,2) NOT NULL DEFAULT 0, notes TEXT NULL, terms TEXT NULL, accounting_provider VARCHAR(30) NULL, accounting_invoice_id VARCHAR(255) NULL, accounting_sync_status VARCHAR(30) NULL DEFAULT 'not_synced', accounting_sync_error TEXT NULL, created_by_user_id VARCHAR(36) NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX idx_company (company_id), INDEX idx_job (company_id, job_id), INDEX idx_status (company_id, status))" },
    { name: 'invoice_lines', ddl: "CREATE TABLE IF NOT EXISTS invoice_lines (id INT AUTO_INCREMENT PRIMARY KEY, invoice_id INT NOT NULL, description TEXT NOT NULL, quantity DECIMAL(10,3) NOT NULL DEFAULT 1, unit VARCHAR(50) NULL, rate DECIMAL(12,2) NOT NULL DEFAULT 0, amount DECIMAL(12,2) NOT NULL DEFAULT 0, sort_order INT NOT NULL DEFAULT 0, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX idx_invoice (invoice_id))" },
    { name: 'invoice_payments', ddl: "CREATE TABLE IF NOT EXISTS invoice_payments (id INT AUTO_INCREMENT PRIMARY KEY, invoice_id INT NOT NULL, payment_date DATE NOT NULL, amount DECIMAL(12,2) NOT NULL DEFAULT 0, method VARCHAR(50) NULL, reference VARCHAR(255) NULL, notes TEXT NULL, created_by_user_id VARCHAR(36) NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX idx_invoice (invoice_id))" },
    // ── Xero OAuth connections ─────────────────────────────────────────────────
    { name: 'xero_connections', ddl: "CREATE TABLE IF NOT EXISTS xero_connections (id INT AUTO_INCREMENT PRIMARY KEY, company_id INT NOT NULL UNIQUE, tenant_id VARCHAR(100) NOT NULL DEFAULT '', tenant_name VARCHAR(255) NOT NULL DEFAULT '', access_token TEXT NOT NULL, refresh_token TEXT NOT NULL, expires_at DATETIME NOT NULL, connected_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX idx_company (company_id))" },
    // ── QuickBooks Online connections ─────────────────────────────────────────
    { name: 'qbo_connections', ddl: "CREATE TABLE IF NOT EXISTS qbo_connections (id INT AUTO_INCREMENT PRIMARY KEY, company_id INT NOT NULL UNIQUE, realm_id VARCHAR(100) NOT NULL DEFAULT '', company_name VARCHAR(255) NOT NULL DEFAULT '', access_token TEXT NOT NULL, refresh_token TEXT NOT NULL, expires_at DATETIME NOT NULL, connected_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX idx_company (company_id))" },
    // ── MYOB AccountRight connections ─────────────────────────────────────────
    { name: 'myob_connections', ddl: "CREATE TABLE IF NOT EXISTS myob_connections (id INT AUTO_INCREMENT PRIMARY KEY, company_id INT NOT NULL UNIQUE, company_file_id VARCHAR(100) NOT NULL DEFAULT '', company_file_name VARCHAR(255) NOT NULL DEFAULT '', access_token TEXT NOT NULL, refresh_token TEXT NOT NULL, expires_at DATETIME NOT NULL, connected_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX idx_company (company_id))" },
    // ── Purchase Orders ────────────────────────────────────────────────────────
    { name: 'job_purchase_orders', ddl: "CREATE TABLE IF NOT EXISTS job_purchase_orders (id INT AUTO_INCREMENT PRIMARY KEY, company_id INT NOT NULL, job_id INT NOT NULL, contractor_id INT NULL, assigned_to_type VARCHAR(20) NOT NULL DEFAULT 'internal', assigned_to_name VARCHAR(255) NULL, trade_type VARCHAR(100) NULL, po_number VARCHAR(50) NOT NULL, title VARCHAR(255) NOT NULL DEFAULT '', instructions TEXT NULL, start_date DATE NULL, finish_date DATE NULL, status VARCHAR(30) NOT NULL DEFAULT 'draft', subtotal DECIMAL(12,2) NOT NULL DEFAULT 0, gst DECIMAL(12,2) NOT NULL DEFAULT 0, total DECIMAL(12,2) NOT NULL DEFAULT 0, cancelled_note TEXT NULL, created_by_user_id VARCHAR(36) NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX idx_company (company_id), INDEX idx_job (company_id, job_id), INDEX idx_status (company_id, status))" },
    { name: 'job_purchase_order_lines', ddl: "CREATE TABLE IF NOT EXISTS job_purchase_order_lines (id INT AUTO_INCREMENT PRIMARY KEY, purchase_order_id INT NOT NULL, progress_line_id INT NULL, description TEXT NOT NULL, qty DECIMAL(10,3) NOT NULL DEFAULT 1, unit VARCHAR(50) NULL, rate DECIMAL(12,2) NOT NULL DEFAULT 0, amount DECIMAL(12,2) NOT NULL DEFAULT 0, sort_order INT NOT NULL DEFAULT 0, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX idx_po (purchase_order_id))" },
    // ── Job Cost Ledger — single source of truth for all job financial events ──
    { name: 'job_cost_ledger', ddl: "CREATE TABLE IF NOT EXISTS job_cost_ledger (id INT AUTO_INCREMENT PRIMARY KEY, company_id INT NOT NULL, job_id INT NOT NULL, job_number VARCHAR(50) NULL, job_title VARCHAR(255) NULL, entry_date DATE NOT NULL, event_type VARCHAR(30) NOT NULL DEFAULT 'MATERIAL', source_module VARCHAR(30) NOT NULL DEFAULT 'manual', source_id VARCHAR(100) NULL, description TEXT NOT NULL, qty DECIMAL(10,3) NOT NULL DEFAULT 1, unit VARCHAR(50) NULL, rate DECIMAL(12,2) NOT NULL DEFAULT 0, subtotal DECIMAL(12,2) NOT NULL DEFAULT 0, gst DECIMAL(12,2) NOT NULL DEFAULT 0, total DECIMAL(12,2) NOT NULL DEFAULT 0, gst_inclusive TINYINT(1) NOT NULL DEFAULT 0, account_code VARCHAR(30) NULL, tax_code VARCHAR(20) NULL DEFAULT 'GST', contact_name VARCHAR(255) NULL, contact_type VARCHAR(30) NULL, reference VARCHAR(100) NULL, status VARCHAR(20) NOT NULL DEFAULT 'pending', approved_by VARCHAR(255) NULL, approved_at DATETIME NULL, created_by_user_id VARCHAR(36) NULL, created_by_name VARCHAR(255) NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX idx_company (company_id), INDEX idx_job (company_id, job_id), INDEX idx_status (company_id, status), INDEX idx_event_type (company_id, event_type), INDEX idx_date (company_id, entry_date))" },
    // ── Secure share links (legacy — superseded by document_shares) ──────────
    { name: 'shared_links', ddl: "CREATE TABLE IF NOT EXISTS shared_links (id INT AUTO_INCREMENT PRIMARY KEY, company_id INT NOT NULL, created_by_user_id VARCHAR(36) NOT NULL, target_type VARCHAR(30) NOT NULL, target_id VARCHAR(100) NOT NULL, token_hash VARCHAR(64) NOT NULL UNIQUE, expires_at DATETIME NOT NULL, max_views INT NULL, view_count INT NOT NULL DEFAULT 0, revoked_at DATETIME NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX idx_company (company_id), INDEX idx_token (token_hash), INDEX idx_target (company_id, target_type, target_id))" },
    { name: 'share_audit_log', ddl: "CREATE TABLE IF NOT EXISTS share_audit_log (id INT AUTO_INCREMENT PRIMARY KEY, shared_link_id INT NOT NULL DEFAULT 0, company_id INT NOT NULL, event_type VARCHAR(50) NOT NULL, ip_address VARCHAR(100) NULL, user_agent VARCHAR(500) NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX idx_link (shared_link_id), INDEX idx_company (company_id, created_at))" },
    // ── Document Engine ───────────────────────────────────────────────────────
    { name: 'documents', ddl: "CREATE TABLE IF NOT EXISTS documents (id INT AUTO_INCREMENT PRIMARY KEY, company_id INT NOT NULL, job_id INT NULL, fleet_asset_id INT NULL, customer_id INT NULL, source_module VARCHAR(50) NOT NULL, source_id VARCHAR(100) NOT NULL, document_type VARCHAR(50) NOT NULL, title VARCHAR(500) NOT NULL, status VARCHAR(30) NOT NULL DEFAULT 'draft', version INT NOT NULL DEFAULT 1, is_locked TINYINT(1) NOT NULL DEFAULT 0, locked_at DATETIME NULL, completed_at DATETIME NULL, pdf_file_id INT NULL, created_by_user_id VARCHAR(36) NOT NULL, updated_by_user_id VARCHAR(36) NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX idx_company (company_id), INDEX idx_job (company_id, job_id), INDEX idx_source (company_id, source_module, source_id), INDEX idx_type (company_id, document_type), INDEX idx_status (company_id, status))" },
    { name: 'document_versions', ddl: "CREATE TABLE IF NOT EXISTS document_versions (id INT AUTO_INCREMENT PRIMARY KEY, document_id INT NOT NULL, version_number INT NOT NULL DEFAULT 1, snapshot_json LONGTEXT NOT NULL, pdf_file_id INT NULL, created_by_user_id VARCHAR(36) NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX idx_document (document_id))" },
    { name: 'document_shares', ddl: "CREATE TABLE IF NOT EXISTS document_shares (id INT AUTO_INCREMENT PRIMARY KEY, document_id INT NOT NULL, company_id INT NOT NULL, token_hash VARCHAR(64) NOT NULL UNIQUE, share_mode VARCHAR(20) NOT NULL DEFAULT 'view', expires_at DATETIME NULL, revoked_at DATETIME NULL, submitted_at DATETIME NULL, max_uses INT NULL, use_count INT NOT NULL DEFAULT 0, passcode_hash VARCHAR(255) NULL, created_by_user_id VARCHAR(36) NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX idx_document (document_id), INDEX idx_token (token_hash), INDEX idx_company (company_id))" },
    { name: 'document_events', ddl: "CREATE TABLE IF NOT EXISTS document_events (id INT AUTO_INCREMENT PRIMARY KEY, document_id INT NOT NULL, company_id INT NOT NULL, event_type VARCHAR(50) NOT NULL, event_note TEXT NULL, user_id VARCHAR(36) NULL, external_name VARCHAR(255) NULL, ip_address VARCHAR(100) NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX idx_document (document_id), INDEX idx_company (company_id, created_at))" },
    // ── Drawing Register ──────────────────────────────────────────────────────
    { name: 'drawing_records', ddl: "CREATE TABLE IF NOT EXISTS drawing_records (id INT AUTO_INCREMENT PRIMARY KEY, company_id INT NOT NULL, job_id INT NOT NULL, file_id INT NOT NULL, drawing_number VARCHAR(100) NULL, title VARCHAR(500) NOT NULL, revision VARCHAR(20) NOT NULL DEFAULT 'A', discipline VARCHAR(100) NOT NULL DEFAULT 'Other', status VARCHAR(50) NOT NULL DEFAULT 'For Construction', original_file_id INT NOT NULL, marked_up_file_id INT NULL, uploaded_by_user_id VARCHAR(36) NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX idx_company (company_id), INDEX idx_job (company_id, job_id), INDEX idx_discipline (company_id, discipline))" },
    // ── Secure Share Links (QR / token-based sharing) ─────────────────────────
    { name: 'secure_share_links', ddl: "CREATE TABLE IF NOT EXISTS secure_share_links (id INT AUTO_INCREMENT PRIMARY KEY, company_id INT NOT NULL, created_by_user_id VARCHAR(36) NOT NULL, token_hash VARCHAR(64) NOT NULL UNIQUE, link_type VARCHAR(30) NOT NULL DEFAULT 'file_transfer', target_type VARCHAR(30) NOT NULL, target_id VARCHAR(100) NOT NULL, title VARCHAR(500) NOT NULL DEFAULT '', permissions_json TEXT NULL, metadata_json TEXT NULL, expires_at DATETIME NULL, password_hash VARCHAR(255) NULL, max_uses INT NULL, use_count INT NOT NULL DEFAULT 0, revoked TINYINT(1) NOT NULL DEFAULT 0, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX idx_company (company_id), INDEX idx_token (token_hash), INDEX idx_target (company_id, target_type, target_id), INDEX idx_revoked (company_id, revoked))" },
    { name: 'secure_share_events', ddl: "CREATE TABLE IF NOT EXISTS secure_share_events (id INT AUTO_INCREMENT PRIMARY KEY, share_link_id INT NOT NULL, company_id INT NOT NULL, event_type VARCHAR(50) NOT NULL, ip_address VARCHAR(100) NULL, user_agent VARCHAR(500) NULL, file_id INT NULL, metadata_json TEXT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX idx_link (share_link_id), INDEX idx_company (company_id, created_at))" },
    // ── Platform Activity Log ─────────────────────────────────────────────────
    // NOTE: columns are also listed in colsToEnsure above for self-healing on
    // older DBs where the table already exists but is missing columns.
    { name: 'platform_activity_log', ddl: "CREATE TABLE IF NOT EXISTS platform_activity_log (id INT AUTO_INCREMENT PRIMARY KEY, event_type VARCHAR(60) NOT NULL DEFAULT '', success TINYINT(1) NOT NULL DEFAULT 1, user_id VARCHAR(36) NULL, email VARCHAR(255) NULL, company_id INT NULL, performed_by_user_id VARCHAR(36) NULL, ip_address VARCHAR(100) NULL, user_agent VARCHAR(500) NULL, reason VARCHAR(500) NULL, metadata_json TEXT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX idx_company (company_id), INDEX idx_user (user_id), INDEX idx_event (event_type), INDEX idx_created (created_at))" },
    // ── Smart Document Builder ────────────────────────────────────────────────
    { name: 'document_templates', ddl: "CREATE TABLE IF NOT EXISTS document_templates (id INT AUTO_INCREMENT PRIMARY KEY, company_id INT NOT NULL, name VARCHAR(255) NOT NULL, template_type VARCHAR(50) NOT NULL DEFAULT 'document', builder_json LONGTEXT NULL, page_layout_json TEXT NULL, theme_json TEXT NULL, source_docx_path VARCHAR(500) NULL, source_docx_name VARCHAR(255) NULL, is_active TINYINT(1) NOT NULL DEFAULT 1, created_by_user_id VARCHAR(36) NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX idx_company (company_id), INDEX idx_type (company_id, template_type), INDEX idx_active (company_id, is_active))" },
    { name: 'document_submissions', ddl: "CREATE TABLE IF NOT EXISTS document_submissions (id INT AUTO_INCREMENT PRIMARY KEY, template_id INT NOT NULL, company_id INT NOT NULL, job_id INT NULL, submitted_by_user_id VARCHAR(36) NULL, submitted_by_name VARCHAR(255) NULL, status VARCHAR(30) NOT NULL DEFAULT 'draft', answers_json LONGTEXT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX idx_template (template_id), INDEX idx_company (company_id), INDEX idx_job (company_id, job_id), INDEX idx_status (company_id, status))" },
    // ── Fleet Service / Maintenance Logs ─────────────────────────────────────
    { name: 'fleet_service_logs', ddl: "CREATE TABLE IF NOT EXISTS fleet_service_logs (id INT AUTO_INCREMENT PRIMARY KEY, company_id INT NOT NULL, fleet_asset_id INT NOT NULL, service_type VARCHAR(60) NOT NULL DEFAULT 'Service', title VARCHAR(255) NOT NULL, service_date DATE NOT NULL, odometer_km INT NULL, cost DECIMAL(12,2) NULL, provider VARCHAR(255) NULL, invoice_number VARCHAR(100) NULL, notes TEXT NULL, next_service_date DATE NULL, next_service_km INT NULL, status VARCHAR(30) NOT NULL DEFAULT 'completed', created_by_user_id VARCHAR(36) NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX idx_company (company_id), INDEX idx_asset (fleet_asset_id), INDEX idx_date (fleet_asset_id, service_date))" },
    // ── SWMS share tokens (public sign-off links) ─────────────────────────────
    { name: 'swms_share_tokens', ddl: "CREATE TABLE IF NOT EXISTS swms_share_tokens (id INT AUTO_INCREMENT PRIMARY KEY, job_swms_id INT NOT NULL, company_id INT NOT NULL, token VARCHAR(64) NOT NULL UNIQUE, created_by_user_id VARCHAR(36) NULL, expires_at DATETIME NULL, revoked TINYINT(1) NOT NULL DEFAULT 0, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX idx_token (token), INDEX idx_job_swms (job_swms_id))" },
    // ── Public form submissions (template-level, no job required) ─────────────
    { name: 'form_public_submissions', ddl: "CREATE TABLE IF NOT EXISTS form_public_submissions (id INT AUTO_INCREMENT PRIMARY KEY, company_id INT NOT NULL, template_id INT NOT NULL, token VARCHAR(64) NOT NULL, submitter_name VARCHAR(255) NULL, submitter_email VARCHAR(255) NULL, job_id INT NULL, answers_json LONGTEXT NULL, status VARCHAR(30) NOT NULL DEFAULT 'submitted', submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, ip_address VARCHAR(64) NULL, INDEX idx_company (company_id), INDEX idx_template (template_id), INDEX idx_token (token), INDEX idx_job (company_id, job_id))" },
    // ── Form public share tokens ──────────────────────────────────────────────
    { name: 'form_share_tokens', ddl: "CREATE TABLE IF NOT EXISTS form_share_tokens (id INT AUTO_INCREMENT PRIMARY KEY, company_id INT NOT NULL, template_id INT NOT NULL, token VARCHAR(64) NOT NULL UNIQUE, created_by_user_id VARCHAR(36) NULL, expires_at DATETIME NULL, revoked TINYINT(1) NOT NULL DEFAULT 0, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX idx_token (token), INDEX idx_template (template_id))" },
    // ── Plan Manager ─────────────────────────────────────────────────────────
    { name: 'project_drawings', ddl: "CREATE TABLE IF NOT EXISTS project_drawings (id INT AUTO_INCREMENT PRIMARY KEY, company_id INT NOT NULL, project_id INT NULL, title VARCHAR(500) NOT NULL, description TEXT NULL, source_file_path VARCHAR(1000) NULL, source_file_name VARCHAR(500) NULL, page_count INT NOT NULL DEFAULT 1, current_revision_id INT NULL, status VARCHAR(30) NOT NULL DEFAULT 'active', created_by VARCHAR(36) NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX idx_company (company_id), INDEX idx_project (company_id, project_id), INDEX idx_status (company_id, status))" },
    { name: 'project_drawing_sheets', ddl: "CREATE TABLE IF NOT EXISTS project_drawing_sheets (id INT AUTO_INCREMENT PRIMARY KEY, drawing_id INT NOT NULL, page_no INT NOT NULL DEFAULT 1, thumbnail_path VARCHAR(1000) NULL, status VARCHAR(30) NOT NULL DEFAULT 'active', created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX idx_drawing (drawing_id), INDEX idx_page (drawing_id, page_no))" },
    { name: 'drawing_revisions', ddl: "CREATE TABLE IF NOT EXISTS drawing_revisions (id INT AUTO_INCREMENT PRIMARY KEY, drawing_id INT NOT NULL, revision_no INT NOT NULL DEFAULT 1, name VARCHAR(255) NOT NULL DEFAULT 'Draft', source_type VARCHAR(20) NOT NULL DEFAULT 'draft', created_by VARCHAR(36) NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, locked TINYINT(1) NOT NULL DEFAULT 0, locked_at DATETIME NULL, locked_by VARCHAR(36) NULL, is_current TINYINT(1) NOT NULL DEFAULT 1, INDEX idx_drawing (drawing_id), INDEX idx_current (drawing_id, is_current))" },
    { name: 'drawing_annotations', ddl: "CREATE TABLE IF NOT EXISTS drawing_annotations (id INT AUTO_INCREMENT PRIMARY KEY, revision_id INT NOT NULL, drawing_id INT NOT NULL, sheet_id INT NULL, page_no INT NOT NULL DEFAULT 1, type VARCHAR(30) NOT NULL, geometry_json LONGTEXT NOT NULL, style_json TEXT NULL, label TEXT NULL, author_id VARCHAR(36) NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, is_locked TINYINT(1) NOT NULL DEFAULT 0, INDEX idx_revision (revision_id), INDEX idx_drawing (drawing_id), INDEX idx_page (revision_id, page_no))" },
    { name: 'drawing_share_tokens', ddl: "CREATE TABLE IF NOT EXISTS drawing_share_tokens (id INT AUTO_INCREMENT PRIMARY KEY, drawing_id INT NOT NULL, company_id INT NOT NULL, revision_id INT NULL, token_hash VARCHAR(64) NOT NULL UNIQUE, expires_at DATETIME NULL, scope VARCHAR(20) NOT NULL DEFAULT 'view', revoked TINYINT(1) NOT NULL DEFAULT 0, created_by VARCHAR(36) NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX idx_token (token_hash), INDEX idx_drawing (drawing_id))" },
    { name: 'job_drawing_links', ddl: "CREATE TABLE IF NOT EXISTS job_drawing_links (id INT AUTO_INCREMENT PRIMARY KEY, job_id INT NOT NULL, drawing_id INT NOT NULL, context_note TEXT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, created_by VARCHAR(36) NULL, UNIQUE KEY uq_job_drawing (job_id, drawing_id), INDEX idx_job (job_id), INDEX idx_drawing (drawing_id))" },
    { name: 'drawing_audit_log', ddl: "CREATE TABLE IF NOT EXISTS drawing_audit_log (id INT AUTO_INCREMENT PRIMARY KEY, drawing_id INT NOT NULL, revision_id INT NULL, actor_id VARCHAR(36) NULL, action VARCHAR(60) NOT NULL, details_json TEXT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX idx_drawing (drawing_id), INDEX idx_created (drawing_id, created_at))" },
  ];
  for (const { name, ddl } of safetyTables) {
    try {
      // Check if table already exists before attempting CREATE — avoids DDL
      // parse errors from stale published bundles that had invalid TEXT defaults.
      const [existRows] = await db.execute(
        sql`SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${name}`
      ) as unknown as [Array<{ cnt: number }>, unknown];
      if (Number(existRows?.[0]?.cnt ?? 0) > 0) continue;
      await db.execute(sql.raw(ddl));
      console.log(`[startup-migration] ${name} table ready`);
    } catch (e: unknown) {
      const msg = String((e as Error)?.message ?? e);
      if (!msg.includes('already exists') && !msg.includes('ER_TABLE_EXISTS')) {
        console.warn(`[startup-migration] ${name} CREATE failed:`, msg);
      }
    }
  }

  // Account recovery tables (idempotent — safe to run on every startup)
  const recoveryTables = [
    {
      name: 'password_reset_tokens',
      ddl: "CREATE TABLE IF NOT EXISTS password_reset_tokens (id VARCHAR(36) NOT NULL PRIMARY KEY, user_id VARCHAR(36) NOT NULL, token_hash VARCHAR(64) NOT NULL, expires_at DATETIME NOT NULL, used_at DATETIME NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX idx_user (user_id), INDEX idx_hash (token_hash))",
    },
    {
      name: 'sms_verification_codes',
      ddl: "CREATE TABLE IF NOT EXISTS sms_verification_codes (id INT AUTO_INCREMENT PRIMARY KEY, user_id VARCHAR(36) NOT NULL, code_hash VARCHAR(64) NOT NULL, expires_at DATETIME NOT NULL, attempts INT NOT NULL DEFAULT 0, used_at DATETIME NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX idx_user (user_id))",
    },
    {
      name: 'trusted_devices',
      ddl: "CREATE TABLE IF NOT EXISTS trusted_devices (id INT AUTO_INCREMENT PRIMARY KEY, user_id VARCHAR(36) NOT NULL, device_fingerprint VARCHAR(512) NOT NULL, device_name VARCHAR(255) NULL, pin_hash VARCHAR(255) NULL, pin_attempts INT NOT NULL DEFAULT 0, pin_locked_until DATETIME NULL, last_used_at DATETIME NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX idx_user (user_id))",
    },
    {
      name: 'manual_verification_log',
      ddl: "CREATE TABLE IF NOT EXISTS manual_verification_log (id INT AUTO_INCREMENT PRIMARY KEY, target_user_id VARCHAR(36) NOT NULL, verified_by_user_id VARCHAR(36) NOT NULL, method VARCHAR(60) NOT NULL DEFAULT 'manual_admin', note TEXT NULL, target_user_email VARCHAR(255) NULL, verified_by_email VARCHAR(255) NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX idx_target (target_user_id))",
    },
    {
      name: 'job_delays',
      ddl: "CREATE TABLE IF NOT EXISTS job_delays (id INT AUTO_INCREMENT PRIMARY KEY, company_id INT NOT NULL, job_id INT NOT NULL, reason VARCHAR(500) NOT NULL, days DECIMAL(6,2) NOT NULL DEFAULT 0, delay_date DATE NOT NULL, notes TEXT NULL, created_by_user_id VARCHAR(36) NOT NULL, created_by_name VARCHAR(255) NOT NULL DEFAULT '', created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX idx_job (job_id), INDEX idx_company (company_id))",
    },
    {
      name: 'notifications',
      ddl: "CREATE TABLE IF NOT EXISTS notifications (id INT AUTO_INCREMENT PRIMARY KEY, company_id INT NOT NULL, user_id VARCHAR(36) NOT NULL, type VARCHAR(60) NOT NULL, title VARCHAR(255) NOT NULL, body TEXT NULL, link VARCHAR(500) NULL, is_read TINYINT(1) NOT NULL DEFAULT 0, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX idx_company_user (company_id, user_id), INDEX idx_user_read (user_id, is_read))",
    },
    // ── Support essentials tables ──────────────────────────────────────────────
    {
      name: 'company_invites',
      ddl: "CREATE TABLE IF NOT EXISTS company_invites (id INT AUTO_INCREMENT PRIMARY KEY, company_id INT NOT NULL, email VARCHAR(255) NOT NULL, name VARCHAR(255) NULL, role VARCHAR(50) NOT NULL DEFAULT 'member', token VARCHAR(64) NOT NULL UNIQUE, status VARCHAR(20) NOT NULL DEFAULT 'pending', invited_by_user_id VARCHAR(36) NOT NULL, invited_by_email VARCHAR(255) NOT NULL, expires_at DATETIME NOT NULL, accepted_at DATETIME NULL, cancelled_at DATETIME NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NULL ON UPDATE CURRENT_TIMESTAMP, INDEX idx_company (company_id), INDEX idx_email (email), INDEX idx_token (token), INDEX idx_status (company_id, status))",
    },
    {
      name: 'email_delivery_log',
      ddl: "CREATE TABLE IF NOT EXISTS email_delivery_log (id INT AUTO_INCREMENT PRIMARY KEY, email_type VARCHAR(60) NOT NULL, recipient_email VARCHAR(255) NOT NULL, recipient_user_id VARCHAR(36) NULL, subject VARCHAR(500) NULL, status VARCHAR(20) NOT NULL DEFAULT 'sent', provider_message_id VARCHAR(255) NULL, error_message TEXT NULL, company_id INT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX idx_recipient (recipient_email), INDEX idx_type (email_type), INDEX idx_status (status), INDEX idx_company (company_id), INDEX idx_created (created_at))",
    },
    {
      name: 'developer_support_notes',
      ddl: "CREATE TABLE IF NOT EXISTS developer_support_notes (id INT AUTO_INCREMENT PRIMARY KEY, user_id VARCHAR(36) NULL, company_id INT NULL, note TEXT NOT NULL, created_by_user_id VARCHAR(36) NOT NULL, created_by_email VARCHAR(255) NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX idx_user (user_id), INDEX idx_company (company_id), INDEX idx_created (created_at))",
    },
    {
      name: 'developer_audit_log',
      ddl: "CREATE TABLE IF NOT EXISTS developer_audit_log (id INT AUTO_INCREMENT PRIMARY KEY, action_type VARCHAR(60) NOT NULL, performed_by_user_id VARCHAR(36) NOT NULL, performed_by_email VARCHAR(255) NOT NULL, target_user_id VARCHAR(36) NULL, target_email VARCHAR(255) NULL, target_company_id INT NULL, reason TEXT NULL, metadata_json TEXT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX idx_performed_by (performed_by_user_id), INDEX idx_target_user (target_user_id), INDEX idx_action (action_type), INDEX idx_created (created_at))",
    },
    // ── Platform email settings (singleton key/value store) ───────────────────
    {
      name: 'platform_email_settings',
      ddl: "CREATE TABLE IF NOT EXISTS platform_email_settings (id INT AUTO_INCREMENT PRIMARY KEY, setting_key VARCHAR(100) NOT NULL UNIQUE, setting_value TEXT NULL, updated_by_user_id VARCHAR(36) NULL, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX idx_key (setting_key))",
    },
  ];
  for (const { name, ddl } of recoveryTables) {
    try {
      const [existRows] = await db.execute(
        sql`SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${name}`
      ) as unknown as [Array<{ cnt: number }>, unknown];
      if (Number(existRows?.[0]?.cnt ?? 0) > 0) continue;
      await db.execute(sql.raw(ddl));
      console.log(`[startup-migration] ${name} table ready`);
    } catch (e: unknown) {
      const msg = String((e as Error)?.message ?? e);
      if (!msg.includes('already exists') && !msg.includes('ER_TABLE_EXISTS')) {
        console.warn(`[startup-migration] ${name} CREATE failed:`, msg);
      }
    }
  }

  // Seed default platform email settings (idempotent — INSERT IGNORE)
  try {
    const defaultEmailSettings = [
      { key: 'contact_notification_email', value: 'darylwilliams1581@gmail.com' },
      { key: 'support_reply_to',           value: 'support@iwillbuild.com' },
      { key: 'from_name',                  value: 'IWILLBUILD' },
    ];
    for (const { key, value } of defaultEmailSettings) {
      await db.execute(sql`
        INSERT IGNORE INTO platform_email_settings (setting_key, setting_value)
        VALUES (${key}, ${value})
      `);
    }
  } catch (e) {
    console.warn('[startup-migration] platform_email_settings seed failed:', e);
  }

  // Ensure phone_number and verification_method columns on user table
  const userRecoveryCols = [
    { column: 'phone_number',        definition: 'VARCHAR(30) NULL' },
    { column: 'verification_method', definition: 'VARCHAR(60) NULL' },
    { column: 'updated_at',          definition: 'DATETIME NULL' },
  ];
  for (const { column, definition } of userRecoveryCols) {
    try {
      const [checkRows] = await db.execute(
        sql`SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user' AND COLUMN_NAME = ${column}`
      ) as unknown as [Array<{ cnt: number }>, unknown];
      const exists = Number(checkRows?.[0]?.cnt ?? 0) > 0;
      if (!exists) {
        await db.execute(sql.raw(`ALTER TABLE \`user\` ADD COLUMN \`${column}\` ${definition}`));
        console.log(`[startup-migration] Added user.${column}`);
      }
    } catch (e: unknown) {
      const msg = String((e as Error)?.message ?? e);
      if (!msg.includes('ER_DUP_FIELDNAME') && !msg.includes('Duplicate column name')) {
        console.warn(`[startup-migration] Could not ensure user.${column}:`, msg);
      }
    }
  }

  // Ensure stakeholder_type column on customers table
  try {
    const [stRows] = await db.execute(
      sql`SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customers' AND COLUMN_NAME = 'stakeholder_type'`
    ) as unknown as [Array<{ cnt: number }>, unknown];
    if (Number(stRows?.[0]?.cnt ?? 0) === 0) {
      await db.execute(sql.raw(`ALTER TABLE \`customers\` ADD COLUMN \`stakeholder_type\` VARCHAR(50) NULL DEFAULT 'Customer'`));
      console.log('[startup-migration] Added customers.stakeholder_type');
    }
  } catch (e: unknown) {
    const msg = String((e as Error)?.message ?? e);
    if (!msg.includes('ER_DUP_FIELDNAME') && !msg.includes('Duplicate column name')) {
      console.warn('[startup-migration] Could not ensure customers.stakeholder_type:', msg);
    }
  }

  // Ensure email columns on manual_verification_log (added in v2)
  const manualVerifCols = [
    { column: 'target_user_email',  definition: 'VARCHAR(255) NULL' },
    { column: 'verified_by_email',  definition: 'VARCHAR(255) NULL' },
  ];
  for (const { column, definition } of manualVerifCols) {
    try {
      const [checkRows] = await db.execute(
        sql`SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'manual_verification_log' AND COLUMN_NAME = ${column}`
      ) as unknown as [Array<{ cnt: number }>, unknown];
      const exists = Number(checkRows?.[0]?.cnt ?? 0) > 0;
      if (!exists) {
        await db.execute(sql.raw(`ALTER TABLE \`manual_verification_log\` ADD COLUMN \`${column}\` ${definition}`));
        console.log(`[startup-migration] Added manual_verification_log.${column}`);
      }
    } catch (e: unknown) {
      const msg = String((e as Error)?.message ?? e);
      if (!msg.includes('ER_DUP_FIELDNAME') && !msg.includes('Duplicate column name')) {
        console.warn(`[startup-migration] Could not ensure manual_verification_log.${column}:`, msg);
      }
    }
  }

  // Ensure billing columns on companies table
  const companiesBillingCols = [
    { column: 'current_period_end',   definition: 'DATETIME NULL' },
    { column: 'cancel_at_period_end', definition: 'TINYINT(1) NOT NULL DEFAULT 0' },
    { column: 'cancelled_at',         definition: 'DATETIME NULL' },
    { column: 'past_due_since',       definition: 'DATETIME NULL' },
    { column: 'industry',             definition: "VARCHAR(50) NOT NULL DEFAULT 'construction'" },
  ];
  for (const { column, definition } of companiesBillingCols) {
    try {
      const [checkRows] = await db.execute(
        sql`SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'companies' AND COLUMN_NAME = ${column}`
      ) as unknown as [Array<{ cnt: number }>, unknown];
      const exists = Number(checkRows?.[0]?.cnt ?? 0) > 0;
      if (!exists) {
        await db.execute(sql.raw(`ALTER TABLE \`companies\` ADD COLUMN \`${column}\` ${definition}`));
        console.log(`[startup-migration] Added companies.${column}`);
      }
    } catch (e: unknown) {
      const msg = String((e as Error)?.message ?? e);
      if (!msg.includes('ER_DUP_FIELDNAME') && !msg.includes('Duplicate column name')) {
        console.warn(`[startup-migration] Could not ensure companies.${column}:`, msg);
      }
    }
  }

  // ── Promote first admin/owner per company to role='owner' (idempotent) ──────
  // Ensures the account owner always sees the Owner Console in the sidebar.
  try {
    await db.execute(sql`
      UPDATE profiles p
      INNER JOIN (
        SELECT MIN(id) AS min_id
        FROM profiles
        WHERE company_id IS NOT NULL
          AND role IN ('admin', 'owner')
        GROUP BY company_id
      ) AS first_admins ON p.id = first_admins.min_id
      SET p.role               = 'owner',
          p.perm_admin          = 1,
          p.perm_invite_users   = 1,
          p.perm_delete_records = 1,
          p.perm_jobs           = 1,
          p.perm_fleet          = 1,
          p.perm_forms          = 1,
          p.perm_files          = 1,
          p.perm_estimating     = 1,
          p.perm_dazza_ai       = 1,
          p.perm_see_dollars    = 1,
          p.status              = 'active'
      WHERE p.role != 'owner'
    `);
    // Also lock all existing owners to have full perms
    await db.execute(sql`
      UPDATE profiles
      SET perm_admin          = 1,
          perm_invite_users   = 1,
          perm_delete_records = 1,
          perm_jobs           = 1,
          perm_fleet          = 1,
          perm_forms          = 1,
          perm_files          = 1,
          perm_estimating     = 1,
          perm_dazza_ai       = 1,
          perm_see_dollars    = 1,
          status              = 'active'
      WHERE role = 'owner'
    `);
    console.log('[startup-migration] owner-role promotion complete');
  } catch (e: unknown) {
    console.warn('[startup-migration] owner-role promotion failed:', String((e as Error)?.message ?? e));
  }

  // ── Add platform_role column (idempotent) ─────────────────────────────────
  try {
    const [prColRows] = await db.execute(
      sql`SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'profiles' AND COLUMN_NAME = 'platform_role'`
    ) as unknown as [Array<{ cnt: number }>, unknown];
    if (Number(prColRows?.[0]?.cnt ?? 0) === 0) {
      await db.execute(sql.raw(`ALTER TABLE \`profiles\` ADD COLUMN \`platform_role\` VARCHAR(30) NULL DEFAULT NULL`));
      console.log('[startup-migration] profiles.platform_role column added');
    }
  } catch (e: unknown) {
    console.warn('[startup-migration] platform_role column error:', String((e as Error)?.message ?? e));
  }

  // ── Seed platform_role = 'developer' for known platform developer emails ──────────
  const platformOwnerEmails = [
    'daryl.williams@energyq.com.au',
    'darylwilliams1581@gmail.com',
  ];
  for (const email of platformOwnerEmails) {
    try {
      // Find the better-auth user by email, then update their profile
      await db.execute(
        sql`UPDATE profiles p
            INNER JOIN user u ON u.id = p.user_id
            SET p.platform_role = 'developer'
            WHERE LOWER(u.email) = LOWER(${email})`
      );
    } catch (e: unknown) {
      console.warn(`[startup-migration] platform_role seed failed for ${email}:`, String((e as Error)?.message ?? e));
    }
  }
  console.log('[startup-migration] platform_role seeding complete');

  // ── platform_activity_log table ───────────────────────────────────────────
  try {
    const [palRows] = await db.execute(
      sql`SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'platform_activity_log'`
    ) as unknown as [Array<{ cnt: number }>, unknown];
    if (Number(palRows?.[0]?.cnt ?? 0) === 0) {
      await db.execute(sql.raw(
        "CREATE TABLE platform_activity_log (" +
        "  id                    BIGINT AUTO_INCREMENT PRIMARY KEY," +
        "  event_type            VARCHAR(60) NOT NULL," +
        "  success               TINYINT(1) NOT NULL DEFAULT 1," +
        "  user_id               VARCHAR(36) NULL," +
        "  email                 VARCHAR(255) NULL," +
        "  company_id            INT NULL," +
        "  performed_by_user_id  VARCHAR(36) NULL," +
        "  ip_address            VARCHAR(100) NULL," +
        "  user_agent            VARCHAR(500) NULL," +
        "  reason                VARCHAR(500) NULL," +
        "  metadata_json         TEXT NULL," +
        "  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP," +
        "  INDEX idx_event_type (event_type)," +
        "  INDEX idx_user_id (user_id)," +
        "  INDEX idx_email (email)," +
        "  INDEX idx_company (company_id)," +
        "  INDEX idx_created (created_at)," +
        "  INDEX idx_success (success)" +
        ")"
      ));
      console.log('[startup-migration] platform_activity_log table created');
    }
  } catch (e: unknown) {
    const msg = String((e as Error)?.message ?? e);
    if (!msg.includes('already exists') && !msg.includes('ER_TABLE_EXISTS')) {
      console.warn('[startup-migration] platform_activity_log create failed:', msg);
    }
  }
}

// ── Startup checks ────────────────────────────────────────────────────────────
const openAiKey = getSecret('OPENAI_API_KEY');
if (!openAiKey || openAiKey.trim().length === 0) {
  console.warn('[dazza] ⚠️  OPENAI_API_KEY is not configured. Dazza AI will answer portal lookups and calculators only. Add the key in Airo Secrets to enable full AI responses.');
} else {
  console.log('[dazza] ✅ OPENAI_API_KEY is configured. Dazza AI full responses enabled.');
}
// ─────────────────────────────────────────────────────────────────────────────

// ── Diagnostic endpoint removed — was unauthenticated and leaked DB schema ────
// ─────────────────────────────────────────────────────────────────────────────

// <api-registrations>
app.post("/api/active-ping", _h_active_ping_post_0);
app.post("/api/auth/change-email", _h_auth_change_email_post_1);
app.post("/api/auth/change-password", _h_auth_change_password_post_2);
app.post("/api/auth/check-signup-status", _h_auth_check_signup_status_post_3);
app.post("/api/auth/forgot-password", _h_auth_forgot_password_post_4);
app.post("/api/auth/pin-login", _h_auth_pin_login_post_5);
app.post("/api/auth/resend-verification", _h_auth_resend_verification_post_6);
app.post("/api/auth/reset-password", _h_auth_reset_password_post_7);
app.post("/api/auth/resume-signup", _h_auth_resume_signup_post_8);
app.post("/api/auth/self-verify", _h_auth_self_verify_post_9);
app.post("/api/auth/send-sms-code", _h_auth_send_sms_code_post_10);
app.get("/api/auth/sms-configured", _h_auth_sms_configured_get_11);
app.post("/api/auth/sms-recovery", _h_auth_sms_recovery_post_12);
app.get("/api/auth/trusted-devices", _h_auth_trusted_devices_get_13);
app.post("/api/auth/trusted-devices", _h_auth_trusted_devices_post_14);
app.delete("/api/auth/trusted-devices/:deviceId", _h_auth_trusted_devices_deviceid_delete_15);
app.get("/api/auth/validate-reset-token", _h_auth_validate_reset_token_get_16);
app.post("/api/auth/verify-email", _h_auth_verify_email_post_17);
app.post("/api/auth/verify-sms-code", _h_auth_verify_sms_code_post_18);
app.get("/api/auth/:action", _h_auth_action_get_19);
app.post("/api/auth/:action", _h_auth_action_post_20);
app.get("/api/auth/:action/:detail", _h_auth_action_detail_get_21);
app.post("/api/auth/:action/:detail", _h_auth_action_detail_post_22);
app.post("/api/billing/cancel-subscription", _h_billing_cancel_subscription_post_23);
app.post("/api/billing/cancellation-feedback", _h_billing_cancellation_feedback_post_24);
app.post("/api/billing/customer-portal", _h_billing_customer_portal_post_25);
app.post("/api/billing/reactivate-subscription", _h_billing_reactivate_subscription_post_26);
app.post("/api/billing/upgrade-subscription", _h_billing_upgrade_subscription_post_27);
app.get("/api/company", _h_company_get_28);
app.put("/api/company", _h_company_put_29);
app.post("/api/company/logo", _h_company_logo_post_30);
app.get("/api/company-settings", _h_company_settings_get_31);
app.put("/api/company-settings", _h_company_settings_put_32);
app.post("/api/contact", _h_contact_post_33);
app.get("/api/cost-guide", _h_cost_guide_get_34);
app.post("/api/cost-guide", _h_cost_guide_post_35);
app.get("/api/cost-guide/export-csv", _h_cost_guide_export_csv_get_36);
app.post("/api/cost-guide/import-csv", _h_cost_guide_import_csv_post_37);
app.delete("/api/cost-guide/:id", _h_cost_guide_id_delete_38);
app.put("/api/cost-guide/:id", _h_cost_guide_id_put_39);
app.get("/api/customers", _h_customers_get_40);
app.post("/api/customers", _h_customers_post_41);
app.delete("/api/customers/:id", _h_customers_id_delete_42);
app.get("/api/customers/:id", _h_customers_id_get_43);
app.put("/api/customers/:id", _h_customers_id_put_44);
app.get("/api/dashboard/kpi", _h_dashboard_kpi_get_45);
app.get("/api/dashboard/setup-check", _h_dashboard_setup_check_get_46);
app.get("/api/dashboard/todos", _h_dashboard_todos_get_47);
app.post("/api/dazza/annette", _h_dazza_annette_post_48);
app.post("/api/dazza/brain/hive/approve", _h_dazza_brain_hive_approve_post_49);
app.post("/api/dazza/brain/hive/reject", _h_dazza_brain_hive_reject_post_50);
app.get("/api/dazza/brain/status", _h_dazza_brain_status_get_51);
app.post("/api/dazza/chat", _h_dazza_chat_post_52);
app.post("/api/dazza/chat-v2", _h_dazza_chat_v2_post_53);
app.post("/api/dazza/chat-v2/stream", _h_dazza_chat_v2_stream_post_54);
app.get("/api/dazza/context", _h_dazza_context_get_55);
app.get("/api/dazza/key-status", _h_dazza_key_status_get_56);
app.get("/api/dazza/knowledge", _h_dazza_knowledge_get_57);
app.post("/api/dazza/knowledge", _h_dazza_knowledge_post_58);
app.delete("/api/dazza/knowledge/:id", _h_dazza_knowledge_id_delete_59);
app.put("/api/dazza/knowledge/:id", _h_dazza_knowledge_id_put_60);
app.get("/api/document-templates", _h_document_templates_get_85);
app.post("/api/document-templates", _h_document_templates_post_86);
app.delete("/api/document-templates/:id", _h_document_templates_id_delete_87);
app.get("/api/document-templates/:id", _h_document_templates_id_get_88);
app.put("/api/document-templates/:id", _h_document_templates_id_put_89);
app.post("/api/document-templates/:id/import-docx", _h_document_templates_id_import_docx_post_90);
app.get("/api/documents", _h_documents_get_91);
app.get("/api/documents/share/:token", _h_documents_share_token_get_92);
app.post("/api/documents/share/:token", _h_documents_share_token_post_93);
app.get("/api/documents/:id", _h_documents_id_get_94);
app.put("/api/documents/:id", _h_documents_id_put_95);
app.get("/api/documents/:id/events", _h_documents_id_events_get_96);
app.delete("/api/documents/:id/share", _h_documents_id_share_delete_97);
app.post("/api/documents/:id/share", _h_documents_id_share_post_98);
app.get("/api/drawings", _h_drawings_get_99);
app.post("/api/drawings", _h_drawings_post_100);
app.post("/api/drawings/upload", _h_drawings_upload_post_101);
app.delete("/api/drawings/:id", _h_drawings_id_delete_102);
app.patch("/api/drawings/:id", _h_drawings_id_patch_103);
app.post("/api/drawings/:id/markup", _h_drawings_id_markup_post_104);
app.get("/api/estimates", _h_estimates_get_105);
app.post("/api/estimates", _h_estimates_post_106);
app.delete("/api/estimates/:id", _h_estimates_id_delete_107);
app.get("/api/estimates/:id", _h_estimates_id_get_108);
app.put("/api/estimates/:id", _h_estimates_id_put_109);
app.get("/api/estimates/:id/export-csv", _h_estimates_id_export_csv_get_110);
app.get("/api/estimates/:id/export-pdf", _h_estimates_id_export_pdf_get_111);
app.post("/api/estimates/:id/import-csv", _h_estimates_id_import_csv_post_112);
app.get("/api/external/form/:token", _h_external_form_token_get_113);
app.post("/api/external/form/:token", _h_external_form_token_post_114);
app.get("/api/files", _h_files_get_115);
app.post("/api/files", _h_files_post_116);
app.delete("/api/files/:id", _h_files_id_delete_117);
app.get("/api/files/:id/download", _h_files_id_download_get_118);
app.get("/api/form-templates", _h_form_templates_get_137);
app.post("/api/form-templates", _h_form_templates_post_138);
app.post("/api/form-templates/seed", _h_form_templates_seed_post_139);
app.delete("/api/form-templates/:id", _h_form_templates_id_delete_140);
app.put("/api/form-templates/:id", _h_form_templates_id_put_141);
app.get("/api/forms/submissions", _h_forms_submissions_get_142);
app.post("/api/forms/templates/:id/share-link", _h_forms_templates_id_share_link_post_143);
app.get("/api/forms/:id/fields", _h_forms_id_fields_get_144);
app.post("/api/forms/:id/fields", _h_forms_id_fields_post_145);
app.post("/api/forms/:id/fields/reorder", _h_forms_id_fields_reorder_post_146);
app.delete("/api/forms/:id/fields/:fieldId", _h_forms_id_fields_fieldid_delete_147);
app.patch("/api/forms/:id/fields/:fieldId", _h_forms_id_fields_fieldid_patch_148);
app.post("/api/forms/:id/fields/:fieldId/thumbnail", _h_forms_id_fields_fieldid_thumbnail_post_149);
app.get("/api/health", _h_health_get_150);
app.get("/api/invoices", _h_invoices_get_173);
app.post("/api/invoices", _h_invoices_post_174);
app.delete("/api/invoices/:id", _h_invoices_id_delete_175);
app.get("/api/invoices/:id", _h_invoices_id_get_176);
app.put("/api/invoices/:id", _h_invoices_id_put_177);
app.post("/api/invoices/:id/duplicate", _h_invoices_id_duplicate_post_178);
app.get("/api/invoices/:id/export-pdf", _h_invoices_id_export_pdf_get_179);
app.post("/api/invoices/:id/mark-sent", _h_invoices_id_mark_sent_post_180);
app.post("/api/invoices/:id/record-payment", _h_invoices_id_record_payment_post_181);
app.post("/api/invoices/:id/void", _h_invoices_id_void_post_182);
app.delete("/api/job-forms/:id", _h_job_forms_id_delete_183);
app.get("/api/job-forms/:id", _h_job_forms_id_get_184);
app.put("/api/job-forms/:id", _h_job_forms_id_put_185);
app.post("/api/job-forms/:id/reset", _h_job_forms_id_reset_post_186);
app.delete("/api/job-forms/:id/share", _h_job_forms_id_share_delete_187);
app.get("/api/job-forms/:id/share", _h_job_forms_id_share_get_188);
app.post("/api/job-forms/:id/share", _h_job_forms_id_share_post_189);
app.get("/api/me", _h_me_get_237);
app.put("/api/me", _h_me_put_238);
app.post("/api/me/2fa/disable", _h_me_2fa_disable_post_239);
app.post("/api/me/2fa/enable", _h_me_2fa_enable_post_240);
app.get("/api/me/2fa/setup", _h_me_2fa_setup_get_241);
app.get("/api/me/2fa/status", _h_me_2fa_status_get_242);
app.post("/api/me/2fa/verify", _h_me_2fa_verify_post_243);
app.post("/api/me/change-password", _h_me_change_password_post_244);
app.get("/api/me/email-status", _h_me_email_status_get_245);
app.get("/api/me/phone", _h_me_phone_get_246);
app.put("/api/me/phone", _h_me_phone_put_247);
app.post("/api/migrate-account-recovery", _h_migrate_account_recovery_post_248);
app.post("/api/migrate-company-settings", _h_migrate_company_settings_post_249);
app.post("/api/migrate-dazza-audit", _h_migrate_dazza_audit_post_250);
app.post("/api/migrate-dazza-knowledge", _h_migrate_dazza_knowledge_post_251);
app.post("/api/migrate-estimates", _h_migrate_estimates_post_252);
app.post("/api/migrate-estimating-library", _h_migrate_estimating_library_post_253);
app.post("/api/migrate-files", _h_migrate_files_post_254);
app.post("/api/migrate-fleet", _h_migrate_fleet_post_255);
app.post("/api/migrate-fleet-driver-sessions", _h_migrate_fleet_driver_sessions_post_256);
app.post("/api/migrate-form-fields", _h_migrate_form_fields_post_257);
app.post("/api/migrate-form-logic", _h_migrate_form_logic_post_258);
app.post("/api/migrate-form-templates", _h_migrate_form_templates_post_259);
app.post("/api/migrate-job-forms", _h_migrate_job_forms_post_260);
app.post("/api/migrate-job-photos", _h_migrate_job_photos_post_261);
app.post("/api/migrate-job-tabs", _h_migrate_job_tabs_post_262);
app.post("/api/migrate-jobs", _h_migrate_jobs_post_263);
app.post("/api/migrate-notifications", _h_migrate_notifications_post_264);
app.post("/api/migrate-owner-console", _h_migrate_owner_console_post_265);
app.post("/api/migrate-owner-role", _h_migrate_owner_role_post_266);
app.post("/api/migrate-pdf-settings", _h_migrate_pdf_settings_post_267);
app.post("/api/migrate-safety", _h_migrate_safety_post_268);
app.post("/api/migrate-starter-pack", _h_migrate_starter_pack_post_269);
app.post("/api/migrate-subscriptions", _h_migrate_subscriptions_post_270);
app.post("/api/migrate-support-mode", _h_migrate_support_mode_post_271);
app.post("/api/migrate-takeoff-pad", _h_migrate_takeoff_pad_post_272);
app.post("/api/migrate-team", _h_migrate_team_post_273);
app.get("/api/notifications/alerts", _h_notifications_alerts_get_274);
app.get("/api/notifications/prefs", _h_notifications_prefs_get_275);
app.put("/api/notifications/prefs", _h_notifications_prefs_put_276);
app.post("/api/notifications/read", _h_notifications_read_post_277);
app.get("/api/owner-console/activity", _h_owner_console_activity_get_278);
app.get("/api/owner-console/cancellation-feedback", _h_owner_console_cancellation_feedback_get_279);
app.get("/api/owner-console/companies", _h_owner_console_companies_get_280);
app.post("/api/owner-console/companies", _h_owner_console_companies_post_281);
app.get("/api/owner-console/companies/usage", _h_owner_console_companies_usage_get_282);
app.put("/api/owner-console/companies/:id/limits", _h_owner_console_companies_id_limits_put_283);
app.get("/api/owner-console/form-templates", _h_owner_console_form_templates_get_284);
app.post("/api/owner-console/form-templates", _h_owner_console_form_templates_post_285);
app.get("/api/owner-console/starter-pack", _h_owner_console_starter_pack_get_286);
app.post("/api/owner-console/starter-pack", _h_owner_console_starter_pack_post_287);
app.get("/api/owner-console/stats", _h_owner_console_stats_get_288);
app.get("/api/owner-console/storage", _h_owner_console_storage_get_289);
app.post("/api/owner-console/system-ai/builtin-checks", _h_owner_console_system_ai_builtin_checks_post_290);
app.get("/api/owner-console/users", _h_owner_console_users_get_291);
app.post("/api/owner-console/users/verify", _h_owner_console_users_verify_post_292);
app.get("/api/plan-manager/drawings", _h_plan_manager_drawings_get_293);
app.post("/api/plan-manager/drawings", _h_plan_manager_drawings_post_294);
app.get("/api/plan-manager/drawings/:id", _h_plan_manager_drawings_id_get_295);
app.put("/api/plan-manager/drawings/:id/annotations", _h_plan_manager_drawings_id_annotations_put_296);
app.post("/api/plan-manager/drawings/:id/archive", _h_plan_manager_drawings_id_archive_post_297);
app.post("/api/plan-manager/drawings/:id/job-links", _h_plan_manager_drawings_id_job_links_post_298);
app.get("/api/plan-manager/drawings/:id/pages/:pageNo/annotations", _h_plan_manager_drawings_id_pages_pageno_annotations_get_299);
app.delete("/api/plan-manager/drawings/:id/permanent", _h_plan_manager_drawings_id_permanent_delete_300);
app.post("/api/plan-manager/drawings/:id/restore", _h_plan_manager_drawings_id_restore_post_301);
app.post("/api/plan-manager/drawings/:id/revisions", _h_plan_manager_drawings_id_revisions_post_302);
app.post("/api/plan-manager/drawings/:id/revisions/:revisionId/finalize", _h_plan_manager_drawings_id_revisions_revisionid_finalize_post_303);
app.post("/api/plan-manager/drawings/:id/upload", _h_plan_manager_drawings_id_upload_post_304);
app.post("/api/plan-manager/share", _h_plan_manager_share_post_305);
app.get("/api/plan-manager/share/validate", _h_plan_manager_share_validate_get_306);
app.get("/api/public/form/:token", _h_public_form_token_get_307);
app.post("/api/public/form/:token/submit", _h_public_form_token_submit_post_308);
app.get("/api/public/swms/:token", _h_public_swms_token_get_309);
app.post("/api/public/swms/:token/signoff", _h_public_swms_token_signoff_post_310);
app.get("/api/recipes", _h_recipes_get_311);
app.post("/api/recipes", _h_recipes_post_312);
app.delete("/api/recipes/:id", _h_recipes_id_delete_313);
app.put("/api/recipes/:id", _h_recipes_id_put_314);
app.get("/api/scheduler/crew", _h_scheduler_crew_get_354);
app.get("/api/scheduler/jobs", _h_scheduler_jobs_get_355);
app.patch("/api/scheduler/jobs/:id/reschedule", _h_scheduler_jobs_id_reschedule_patch_356);
app.get("/api/secure-share", _h_secure_share_get_357);
app.post("/api/secure-share", _h_secure_share_post_358);
app.delete("/api/secure-share/:id", _h_secure_share_id_delete_359);
app.get("/api/secure-share/:token", _h_secure_share_token_get_360);
app.post("/api/secure-share/:token", _h_secure_share_token_post_361);
app.get("/api/share/:token", _h_share_token_get_381);
app.post("/api/signup", _h_signup_post_382);
app.post("/api/stripe/create-checkout-session", _h_stripe_create_checkout_session_post_383);
app.get("/api/stripe/session/:sessionId", _h_stripe_session_sessionid_get_384);
app.post("/api/subscription/create-checkout", _h_subscription_create_checkout_post_385);
app.get("/api/subscription/status", _h_subscription_status_get_386);
app.post("/api/subscription/webhook", _h_subscription_webhook_post_387);
app.get("/api/support-mode/audit", _h_support_mode_audit_get_388);
app.get("/api/support-mode/checklist", _h_support_mode_checklist_get_389);
app.put("/api/support-mode/checklist", _h_support_mode_checklist_put_390);
app.post("/api/support-mode/enter", _h_support_mode_enter_post_391);
app.post("/api/support-mode/exit", _h_support_mode_exit_post_392);
app.get("/api/support-mode/status", _h_support_mode_status_get_393);
app.get("/api/takeoff-pad", _h_takeoff_pad_get_394);
app.put("/api/takeoff-pad", _h_takeoff_pad_put_395);
app.get("/api/team", _h_team_get_396);
app.post("/api/team/invite", _h_team_invite_post_397);
app.get("/api/team/invites", _h_team_invites_get_398);
app.post("/api/team/invites", _h_team_invites_post_399);
app.post("/api/team/invites/:id/cancel", _h_team_invites_id_cancel_post_400);
app.post("/api/team/invites/:id/resend", _h_team_invites_id_resend_post_401);
app.get("/api/team/members", _h_team_members_get_402);
app.post("/api/team/resend-verification", _h_team_resend_verification_post_403);
app.post("/api/team/verify-user", _h_team_verify_user_post_404);
app.delete("/api/team/:id", _h_team_id_delete_405);
app.put("/api/team/:id", _h_team_id_put_406);
app.get("/api/usage", _h_usage_get_407);
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
	// Allow only the public marketing pages; block all authenticated portal routes.
	const body = [
		"User-agent: *",
		"# Public pages",
		"Allow: /$",
		"Allow: /login$",
		"Allow: /signup$",
		"Allow: /privacy$",
		"Allow: /terms$",
		"Allow: /forgot-password$",
		"",
		"# Block authenticated portal routes",
		"Disallow: /dashboard",
		"Disallow: /jobs",
		"Disallow: /projects",
		"Disallow: /scheduler",
		"Disallow: /fleet",
		"Disallow: /forms",
		"Disallow: /files",
		"Disallow: /estimating",
		"Disallow: /safety",
		"Disallow: /customers",
		"Disallow: /stakeholders",
		"Disallow: /invoices",
		"Disallow: /downloads",
		"Disallow: /dazza-ai",
		"Disallow: /annette",
		"Disallow: /team",
		"Disallow: /settings",
		"Disallow: /owner-console",
		"Disallow: /billing",
		"Disallow: /subscription",
		"Disallow: /tools",
		"Disallow: /check-email",
		"Disallow: /verify-email",
		"Disallow: /verify-required",
		"Disallow: /reset-password",
		"Disallow: /api/",
		"Disallow: /share/",
		"Disallow: /external/",
		"Disallow: /documents/",
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
		.filter((r) => typeof r.path === "string" && r.path.startsWith("/") && r.sitemap !== false)
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
		// Use a static import() path so security scanners don't flag a
		// dynamic string being passed to import().  The module may not exist
		// in all build configurations (e.g. SSR-only bundles), so we still
		// catch ERR_MODULE_NOT_FOUND and suppress it silently.
		let mod: { closeConnection?: () => Promise<void> | void } | null = null;
		try {
			mod = await import("./db/client.js");
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

	// ── Run migrations then start listening — wrapped in async IIFE so
	// top-level await is not needed (publish esbuild target doesn't support it)
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

			// ── fleet_driver_sessions ─────────────────────────────────────────
			try {
				const { db: _db } = await import('./db/client.js');
				const { sql: _sql } = await import('drizzle-orm');
				await _db.execute(_sql`
					CREATE TABLE IF NOT EXISTS fleet_driver_sessions (
						id INT PRIMARY KEY AUTO_INCREMENT,
						company_id INT NOT NULL,
						fleet_asset_id INT NOT NULL,
						user_id VARCHAR(36) NOT NULL,
						driver_name VARCHAR(255) NOT NULL,
						start_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
						end_at TIMESTAMP NULL,
						status VARCHAR(20) NOT NULL DEFAULT 'active',
						source VARCHAR(50) NOT NULL DEFAULT 'dashboard_quick_start',
						created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
						updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
						FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
						FOREIGN KEY (fleet_asset_id) REFERENCES fleet_assets(id) ON DELETE CASCADE,
						FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
					) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
				`);
				console.log('[startup] fleet_driver_sessions table ready');
			} catch (e) {
				console.warn('[startup] fleet_driver_sessions migration skipped:', (e as Error)?.message?.slice(0, 120));
			}

			// ── starter_pack_runs + companies columns ─────────────────────────
			try {
				const { db: _db } = await import('./db/client.js');
				const { sql: _sql } = await import('drizzle-orm');
				await _db.execute(_sql`
					CREATE TABLE IF NOT EXISTS starter_pack_runs (
						id INT PRIMARY KEY AUTO_INCREMENT,
						company_id INT NOT NULL,
						run_by_user_id VARCHAR(36) NULL,
						status VARCHAR(30) NOT NULL DEFAULT 'pending',
						notes TEXT NULL,
						created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
						FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
					) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
				`);
				console.log('[startup] starter_pack_runs table ready');
			} catch (e) {
				console.warn('[startup] starter_pack_runs migration skipped:', (e as Error)?.message?.slice(0, 120));
			}
			try {
				const { db: _db } = await import('./db/client.js');
				const { sql: _sql } = await import('drizzle-orm');
				// Use INFORMATION_SCHEMA check — ADD COLUMN IF NOT EXISTS not supported on all MySQL versions
				const [spCols] = await _db.execute(
					_sql`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'companies' AND COLUMN_NAME IN ('starter_pack_loaded', 'starter_pack_loaded_at')`
				) as unknown as [Array<{ COLUMN_NAME: string }>, unknown];
				const existingCols = new Set((spCols ?? []).map((r) => r.COLUMN_NAME));
				if (!existingCols.has('starter_pack_loaded')) {
					await _db.execute(_sql.raw(`ALTER TABLE \`companies\` ADD COLUMN \`starter_pack_loaded\` TINYINT(1) NOT NULL DEFAULT 0`));
				}
				if (!existingCols.has('starter_pack_loaded_at')) {
					await _db.execute(_sql.raw(`ALTER TABLE \`companies\` ADD COLUMN \`starter_pack_loaded_at\` TIMESTAMP NULL`));
				}
				console.log('[startup] companies.starter_pack_loaded columns ready');
			} catch (e) {
				const msg = (e as Error)?.message ?? '';
				if (!msg.includes('Duplicate column') && !msg.includes('already exists')) {
					console.warn('[startup] companies starter_pack columns migration skipped:', msg.slice(0, 120));
				}
			}

		// ── developer_audit_log table ─────────────────────────────────────────
		try {
			const { db: _db } = await import('./db/client.js');
			const { sql: _sql } = await import('drizzle-orm');
			await _db.execute(_sql`
				CREATE TABLE IF NOT EXISTS developer_audit_log (
					id INT AUTO_INCREMENT PRIMARY KEY,
					action_type VARCHAR(60) NOT NULL,
					performed_by_user_id VARCHAR(36) NOT NULL,
					performed_by_email VARCHAR(255) NULL,
					target_user_id VARCHAR(36) NOT NULL,
					target_email VARCHAR(255) NULL,
					target_company_id INT NULL,
					reason TEXT NULL,
					meta TEXT NULL,
					created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
					INDEX idx_dal_target (target_user_id),
					INDEX idx_dal_performer (performed_by_user_id),
					INDEX idx_dal_action (action_type),
					INDEX idx_dal_created (created_at)
				) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
			`);
			console.log('[startup] developer_audit_log table ready');
		} catch (e) {
			console.warn('[startup] developer_audit_log migration skipped:', (e as Error)?.message?.slice(0, 120));
		}

		// ── All migrations done — now start accepting requests ─────────────────
		const server = app.listen(port, host, () => {
			console.log(`Server listening on http://${host}:${port}`);
		});
		server.on("error", (err) => {
			console.error("ssr.server.listen-failed", { port, host, code: err.code, error: err.message });
			process.exit(1);
		});
	})();
}

export default app;
