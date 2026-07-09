// entry.ts — portal whitelist updated 2026-07-06
import express, { type Express, type NextFunction, type Request, type Response } from "express";
// Static import of entry-server so Rollup inlines it directly into server.bundle.mjs.
// Previously this was a dynamic import("../entry-server") which produced a separate
// dist/bin/entry-server-HASH.js chunk. The platform overlays new archives on top of
// old filesystems without cleaning, so stale entry-server chunks from previous builds
// persisted in dist/bin/ and caused "Uw is not a constructor" SSR crashes when the
// new server.bundle.mjs tried to load a chunk that no longer matched.
// Inlining eliminates the separate chunk entirely — no stale file, no hash mismatch.
import * as _entryServerModule from "../entry-server";
import { fileURLToPath } from "node:url";
import { dirname, extname, join } from "node:path";
import { readFileSync } from "node:fs";
import { getSecret } from '#airo/secrets';
import { globalApiLimiter, authApiLimiter } from './lib/api-rate-limiter.js';
import { requirePlatformOwner } from './lib/platform-owner-guard.js';

// Route group files — each registers a slice of the API surface.
// Imported here so Rollup includes them in the single server.bundle entry
// (no separate rollupOptions.input entries needed — single-entry build uses
// far less peak memory than a 7-entry parallel build).
// Using namespace imports (import * as X) so the named `register` export
// is accessible regardless of how Vite's SSR module runner wraps the module.
import * as _routesJobs from './routes-jobs.js';
import * as _routesSafety from './routes-safety.js';
import * as _routesDeveloper from './routes-developer.js';
import * as _routesIntegrations from './routes-integrations.js';
import * as _routesSettings from './routes-settings.js';
import * as _routesFleet from './routes-fleet.js';

// <api-imports>
import active_ping_post_0 from "./api/active-ping/POST";
import asset_manager_assets_get_1 from "./api/asset-manager/assets/GET";
import asset_manager_assets_post_2 from "./api/asset-manager/assets/POST";
import asset_manager_assets_id_get_3 from "./api/asset-manager/assets/[id]/GET";
import asset_manager_assets_id_patch_4 from "./api/asset-manager/assets/[id]/PATCH";
import asset_manager_assets_id_archive_post_5 from "./api/asset-manager/assets/[id]/archive/POST";
import asset_manager_assets_id_permanent_delete_6 from "./api/asset-manager/assets/[id]/permanent/DELETE";
import asset_manager_assets_id_restore_post_7 from "./api/asset-manager/assets/[id]/restore/POST";
import asset_manager_defects_get_8 from "./api/asset-manager/defects/GET";
import asset_manager_defects_id_patch_9 from "./api/asset-manager/defects/[id]/PATCH";
import asset_manager_defects_id_archive_post_10 from "./api/asset-manager/defects/[id]/archive/POST";
import asset_manager_inspections_get_11 from "./api/asset-manager/inspections/GET";
import asset_manager_inspections_post_12 from "./api/asset-manager/inspections/POST";
import asset_manager_inspections_id_get_13 from "./api/asset-manager/inspections/[id]/GET";
import asset_manager_inspections_id_patch_14 from "./api/asset-manager/inspections/[id]/PATCH";
import asset_manager_inspections_id_archive_post_15 from "./api/asset-manager/inspections/[id]/archive/POST";
import asset_manager_inspections_id_closeout_post_16 from "./api/asset-manager/inspections/[id]/closeout/POST";
import asset_manager_inspections_id_defects_post_17 from "./api/asset-manager/inspections/[id]/defects/POST";
import asset_manager_inspections_id_permanent_delete_18 from "./api/asset-manager/inspections/[id]/permanent/DELETE";
import asset_manager_inspections_id_photos_post_19 from "./api/asset-manager/inspections/[id]/photos/POST";
import asset_manager_inspections_id_report_share_post_20 from "./api/asset-manager/inspections/[id]/report/share/POST";
import asset_manager_inspections_id_restore_post_21 from "./api/asset-manager/inspections/[id]/restore/POST";
import asset_manager_inspections_id_tenders_post_22 from "./api/asset-manager/inspections/[id]/tenders/POST";
import asset_manager_monitoring_get_23 from "./api/asset-manager/monitoring/GET";
import asset_manager_reports_shareToken_get_24 from "./api/asset-manager/reports/[shareToken]/GET";
import asset_manager_tenders_get_25 from "./api/asset-manager/tenders/GET";
import asset_manager_tenders_id_patch_26 from "./api/asset-manager/tenders/[id]/PATCH";
import asset_manager_tenders_id_complete_post_27 from "./api/asset-manager/tenders/[id]/complete/POST";
import asset_manager_tenders_id_contracts_post_28 from "./api/asset-manager/tenders/[id]/contracts/POST";
import asset_manager_tenders_id_attachments_get from "./api/asset-manager/tenders/[id]/attachments/GET";
import asset_manager_tenders_id_attachments_post from "./api/asset-manager/tenders/[id]/attachments/POST";
import asset_manager_tenders_id_attachments_fileId_delete from "./api/asset-manager/tenders/[id]/attachments/[fileId]/DELETE";
// ── Asset Manager: per-asset todos / notes / photos ──────────────────────────
import am_assets_id_todos_get from "./api/asset-manager/assets/[id]/todos/GET";
import am_assets_id_todos_post from "./api/asset-manager/assets/[id]/todos/POST";
import am_assets_id_todos_todoId_put from "./api/asset-manager/assets/[id]/todos/[todoId]/PUT";
import am_assets_id_todos_todoId_delete from "./api/asset-manager/assets/[id]/todos/[todoId]/DELETE";
import am_assets_id_notes_get from "./api/asset-manager/assets/[id]/notes/GET";
import am_assets_id_notes_post from "./api/asset-manager/assets/[id]/notes/POST";
import am_assets_id_notes_noteId_delete from "./api/asset-manager/assets/[id]/notes/[noteId]/DELETE";
import am_assets_id_photos_get from "./api/asset-manager/assets/[id]/photos/GET";
import am_assets_id_photos_post from "./api/asset-manager/assets/[id]/photos/POST";
import am_assets_id_photos_photoId_delete from "./api/asset-manager/assets/[id]/photos/[photoId]/DELETE";
import auth_change_email_post_29 from "./api/auth/change-email/POST";
import auth_change_password_post_30 from "./api/auth/change-password/POST";
import auth_check_signup_status_post_31 from "./api/auth/check-signup-status/POST";
import auth_forgot_password_post_32 from "./api/auth/forgot-password/POST";
import auth_pin_login_post_33 from "./api/auth/pin-login/POST";
import auth_resend_verification_post_34 from "./api/auth/resend-verification/POST";
import auth_reset_password_post_35 from "./api/auth/reset-password/POST";
import auth_resume_signup_post_36 from "./api/auth/resume-signup/POST";
import auth_self_verify_post_37 from "./api/auth/self-verify/POST";
import auth_send_sms_code_post_38 from "./api/auth/send-sms-code/POST";
import auth_sms_configured_get_39 from "./api/auth/sms-configured/GET";
import auth_sms_recovery_post_40 from "./api/auth/sms-recovery/POST";
import auth_trusted_devices_get_41 from "./api/auth/trusted-devices/GET";
import auth_trusted_devices_post_42 from "./api/auth/trusted-devices/POST";
import auth_trusted_devices_deviceId_delete_43 from "./api/auth/trusted-devices/[deviceId]/DELETE";
import auth_validate_reset_token_get_44 from "./api/auth/validate-reset-token/GET";
import auth_verify_email_post_45 from "./api/auth/verify-email/POST";
import auth_verify_sms_code_post_46 from "./api/auth/verify-sms-code/POST";
import auth_action_get_47 from "./api/auth/[action]/GET";
import auth_action_post_48 from "./api/auth/[action]/POST";
import auth_action_detail_get_49 from "./api/auth/[action]/[detail]/GET";
import auth_action_detail_post_50 from "./api/auth/[action]/[detail]/POST";
import billing_cancel_subscription_post_51 from "./api/billing/cancel-subscription/POST";
import billing_cancellation_feedback_post_52 from "./api/billing/cancellation-feedback/POST";
import billing_customer_portal_post_53 from "./api/billing/customer-portal/POST";
import billing_reactivate_subscription_post_54 from "./api/billing/reactivate-subscription/POST";
import billing_upgrade_subscription_post_55 from "./api/billing/upgrade-subscription/POST";
import company_get_56 from "./api/company/GET";
import company_put_57 from "./api/company/PUT";
import company_logo_post_58 from "./api/company/logo/POST";
import company_settings_get_59 from "./api/company-settings/GET";
import company_settings_put_60 from "./api/company-settings/PUT";
import contact_post_61 from "./api/contact/POST";
import cost_guide_get_62 from "./api/cost-guide/GET";
import cost_guide_post_63 from "./api/cost-guide/POST";
import cost_guide_export_csv_get_64 from "./api/cost-guide/export-csv/GET";
import cost_guide_import_csv_post_65 from "./api/cost-guide/import-csv/POST";
import cost_guide_id_delete_66 from "./api/cost-guide/[id]/DELETE";
import cost_guide_id_put_67 from "./api/cost-guide/[id]/PUT";
import customers_get_68 from "./api/customers/GET";
import customers_post_69 from "./api/customers/POST";
import customers_id_delete_70 from "./api/customers/[id]/DELETE";
import customers_id_get_71 from "./api/customers/[id]/GET";
import customers_id_put_72 from "./api/customers/[id]/PUT";
import dashboard_kpi_get_73 from "./api/dashboard/kpi/GET";
import dashboard_setup_check_get_74 from "./api/dashboard/setup-check/GET";
import dashboard_todos_get_75 from "./api/dashboard/todos/GET";
import dazza_brain_hive_approve_post_77 from "./api/dazza/brain/hive/approve/POST";
import dazza_brain_hive_reject_post_78 from "./api/dazza/brain/hive/reject/POST";
import dazza_brain_status_get_79 from "./api/dazza/brain/status/GET";
import dazza_context_get_83 from "./api/dazza/context/GET";
import dazza_key_status_get_84 from "./api/dazza/key-status/GET";
import dazza_knowledge_get_85 from "./api/dazza/knowledge/GET";
import dazza_knowledge_post_86 from "./api/dazza/knowledge/POST";
import dazza_knowledge_id_delete_87 from "./api/dazza/knowledge/[id]/DELETE";
import dazza_knowledge_id_put_88 from "./api/dazza/knowledge/[id]/PUT";
import developer_activity_log_get_89 from "./api/developer/activity-log/GET";
import developer_audit_log_get_90 from "./api/developer/audit-log/GET";
import developer_companies_id_archive_post_91 from "./api/developer/companies/[id]/archive/POST";
import developer_company_health_get_92 from "./api/developer/company-health/GET";
import developer_email_log_get_93 from "./api/developer/email-log/GET";
import developer_email_settings_get_94 from "./api/developer/email-settings/GET";
import developer_email_settings_put_95 from "./api/developer/email-settings/PUT";
import developer_email_settings_test_post_96 from "./api/developer/email-settings/test/POST";
import developer_support_notes_get_97 from "./api/developer/support-notes/GET";
import developer_support_notes_post_98 from "./api/developer/support-notes/POST";
import developer_support_notes_id_delete_99 from "./api/developer/support-notes/[id]/DELETE";
import developer_users_id_assign_company_post_100 from "./api/developer/users/[id]/assign-company/POST";
import developer_users_id_deactivate_post_101 from "./api/developer/users/[id]/deactivate/POST";
import developer_users_id_delete_orphan_post_102 from "./api/developer/users/[id]/delete-orphan/POST";
import developer_users_id_force_temp_password_post_103 from "./api/developer/users/[id]/force-temp-password/POST";
import developer_users_id_impersonate_delete_104 from "./api/developer/users/[id]/impersonate/DELETE";
import developer_users_id_impersonate_post_105 from "./api/developer/users/[id]/impersonate/POST";
import developer_users_id_reactivate_post_106 from "./api/developer/users/[id]/reactivate/POST";
import developer_users_id_resend_verification_post_107 from "./api/developer/users/[id]/resend-verification/POST";
import developer_users_id_role_put_108 from "./api/developer/users/[id]/role/PUT";
import developer_users_id_send_reset_email_post_109 from "./api/developer/users/[id]/send-reset-email/POST";
import developer_users_id_sessions_delete_110 from "./api/developer/users/[id]/sessions/DELETE";
import developer_users_id_sessions_get_111 from "./api/developer/users/[id]/sessions/GET";
import developer_users_id_unlock_account_post_112 from "./api/developer/users/[id]/unlock-account/POST";
import document_templates_get_113 from "./api/document-templates/GET";
import document_templates_post_114 from "./api/document-templates/POST";
import document_templates_id_delete_115 from "./api/document-templates/[id]/DELETE";
import document_templates_id_get_116 from "./api/document-templates/[id]/GET";
import document_templates_id_put_117 from "./api/document-templates/[id]/PUT";
import document_templates_id_duplicate_post_118 from "./api/document-templates/[id]/duplicate/POST";
import document_templates_id_import_blocks_post_121 from "./api/document-templates/[id]/import-blocks/POST";
import document_templates_id_import_docx_post_122 from "./api/document-templates/[id]/import-docx/POST";
import document_templates_id_import_pdf_post_123 from "./api/document-templates/[id]/import-pdf/POST";
import document_templates_id_publish_to_library_post_124 from "./api/document-templates/[id]/publish-to-library/POST";
import documents_get_125 from "./api/documents/GET";
import documents_share_token_get_126 from "./api/documents/share/[token]/GET";
import documents_share_token_post_127 from "./api/documents/share/[token]/POST";
import documents_id_get_128 from "./api/documents/[id]/GET";
import documents_id_put_129 from "./api/documents/[id]/PUT";
import documents_id_events_get_130 from "./api/documents/[id]/events/GET";
import documents_id_share_delete_131 from "./api/documents/[id]/share/DELETE";
import documents_id_share_post_132 from "./api/documents/[id]/share/POST";
import drawings_get_133 from "./api/drawings/GET";
import drawings_post_134 from "./api/drawings/POST";
import drawings_upload_post_135 from "./api/drawings/upload/POST";
import drawings_id_delete_136 from "./api/drawings/[id]/DELETE";
import drawings_id_patch_137 from "./api/drawings/[id]/PATCH";
import drawings_id_markup_post_138 from "./api/drawings/[id]/markup/POST";
import emergency_alerts_get_139 from "./api/emergency-alerts/GET";
import emergency_alerts_post_140 from "./api/emergency-alerts/POST";
import emergency_alerts_id_put_141 from "./api/emergency-alerts/[id]/PUT";
import estimates_get_142 from "./api/estimates/GET";
import estimates_post_143 from "./api/estimates/POST";
import estimates_id_delete_144 from "./api/estimates/[id]/DELETE";
import estimates_id_get_145 from "./api/estimates/[id]/GET";
import estimates_id_put_146 from "./api/estimates/[id]/PUT";
import estimates_id_export_csv_get_147 from "./api/estimates/[id]/export-csv/GET";
import estimates_id_export_pdf_get_148 from "./api/estimates/[id]/export-pdf/GET";
import estimates_id_import_csv_post_149 from "./api/estimates/[id]/import-csv/POST";
import external_form_token_get_150 from "./api/external/form/[token]/GET";
import external_form_token_post_151 from "./api/external/form/[token]/POST";
import files_get_152 from "./api/files/GET";
import files_post_153 from "./api/files/POST";
import files_id_delete_154 from "./api/files/[id]/DELETE";
import files_id_download_get_155 from "./api/files/[id]/download/GET";
import fleet_get_156 from "./api/fleet/GET";
import fleet_post_157 from "./api/fleet/POST";
import fleet_analytics_settings_get_158 from "./api/fleet/analytics-settings/GET";
import fleet_analytics_settings_put_159 from "./api/fleet/analytics-settings/PUT";
import fleet_driver_sessions_post_160 from "./api/fleet/driver-sessions/POST";
import fleet_driver_sessions_active_get_161 from "./api/fleet/driver-sessions/active/GET";
import fleet_driver_sessions_live_get_162 from "./api/fleet/driver-sessions/live/GET";
import fleet_driver_sessions_id_stop_post_163 from "./api/fleet/driver-sessions/[id]/stop/POST";
import fleet_driver_sessions_id_summary_get_164 from "./api/fleet/driver-sessions/[id]/summary/GET";
import fleet_driver_sessions_id_telemetry_post_165 from "./api/fleet/driver-sessions/[id]/telemetry/POST";
import fleet_driver_sessions_id_telemetry_latest_get_166 from "./api/fleet/driver-sessions/[id]/telemetry/latest/GET";
import fleet_flags_get_167 from "./api/fleet/flags/GET";
import fleet_service_logs_logId_delete_168 from "./api/fleet/service-logs/[logId]/DELETE";
import fleet_service_logs_logId_patch_169 from "./api/fleet/service-logs/[logId]/PATCH";
import fleet_vehicles_get_170 from "./api/fleet/vehicles/GET";
import fleet_id_delete_171 from "./api/fleet/[id]/DELETE";
import fleet_id_get_172 from "./api/fleet/[id]/GET";
import fleet_id_put_173 from "./api/fleet/[id]/PUT";
import fleet_id_driver_sessions_get_174 from "./api/fleet/[id]/driver-sessions/GET";
import fleet_id_files_get_175 from "./api/fleet/[id]/files/GET";
import fleet_id_prestarts_get_176 from "./api/fleet/[id]/prestarts/GET";
import fleet_id_prestarts_post_177 from "./api/fleet/[id]/prestarts/POST";
import fleet_id_service_logs_get_178 from "./api/fleet/[id]/service-logs/GET";
import fleet_id_service_logs_post_179 from "./api/fleet/[id]/service-logs/POST";
import fleet_id_signin_post_180 from "./api/fleet/[id]/signin/POST";
import fleet_id_signout_post_181 from "./api/fleet/[id]/signout/POST";
import fleet_id_usage_export_get_182 from "./api/fleet/[id]/usage-export/GET";
import fleet_id_usage_status_get_183 from "./api/fleet/[id]/usage-status/GET";
import fleet_id_usage_summary_get_184 from "./api/fleet/[id]/usage-summary/GET";
import form_templates_get_185 from "./api/form-templates/GET";
import form_templates_post_186 from "./api/form-templates/POST";
import form_templates_id_delete_188 from "./api/form-templates/[id]/DELETE";
import form_templates_id_put_189 from "./api/form-templates/[id]/PUT";
import forms_migrate_skip_logic_post_190 from "./api/forms/migrate-skip-logic/POST";
import forms_skip_audit_get_191 from "./api/forms/skip-audit/GET";
import forms_skip_audit_post_192 from "./api/forms/skip-audit/POST";
import forms_submissions_get_193 from "./api/forms/submissions/GET";
import forms_templates_id_share_link_post_194 from "./api/forms/templates/[id]/share-link/POST";
import forms_id_fields_get_195 from "./api/forms/[id]/fields/GET";
import forms_id_fields_post_196 from "./api/forms/[id]/fields/POST";
import forms_id_fields_reorder_post_197 from "./api/forms/[id]/fields/reorder/POST";
import forms_id_fields_fieldId_delete_198 from "./api/forms/[id]/fields/[fieldId]/DELETE";
import forms_id_fields_fieldId_patch_199 from "./api/forms/[id]/fields/[fieldId]/PATCH";
import forms_id_fields_fieldId_thumbnail_post_200 from "./api/forms/[id]/fields/[fieldId]/thumbnail/POST";
import health_get_201 from "./api/health/GET";
import integrations_myob_auth_url_get_202 from "./api/integrations/myob/auth-url/GET";
import integrations_myob_callback_get_203 from "./api/integrations/myob/callback/GET";
import integrations_myob_disconnect_post_204 from "./api/integrations/myob/disconnect/POST";
import integrations_myob_status_get_205 from "./api/integrations/myob/status/GET";
import integrations_myob_sync_invoice_post_206 from "./api/integrations/myob/sync-invoice/POST";
import integrations_onedrive_auth_url_get_207 from "./api/integrations/onedrive/auth-url/GET";
import integrations_onedrive_callback_get_208 from "./api/integrations/onedrive/callback/GET";
import integrations_onedrive_disconnect_post_209 from "./api/integrations/onedrive/disconnect/POST";
import integrations_onedrive_status_get_210 from "./api/integrations/onedrive/status/GET";
import integrations_onedrive_upload_file_post_211 from "./api/integrations/onedrive/upload-file/POST";
import integrations_qbo_auth_url_get_212 from "./api/integrations/qbo/auth-url/GET";
import integrations_qbo_callback_get_213 from "./api/integrations/qbo/callback/GET";
import integrations_qbo_disconnect_post_214 from "./api/integrations/qbo/disconnect/POST";
import integrations_qbo_status_get_215 from "./api/integrations/qbo/status/GET";
import integrations_qbo_sync_invoice_post_216 from "./api/integrations/qbo/sync-invoice/POST";
import integrations_xero_auth_url_get_217 from "./api/integrations/xero/auth-url/GET";
import integrations_xero_callback_get_218 from "./api/integrations/xero/callback/GET";
import integrations_xero_disconnect_post_219 from "./api/integrations/xero/disconnect/POST";
import integrations_xero_status_get_220 from "./api/integrations/xero/status/GET";
import integrations_xero_sync_customer_post_221 from "./api/integrations/xero/sync-customer/POST";
import integrations_xero_sync_invoice_post_222 from "./api/integrations/xero/sync-invoice/POST";
import integrations_xero_webhook_post_223 from "./api/integrations/xero/webhook/POST";
import invoices_get_224 from "./api/invoices/GET";
import invoices_post_225 from "./api/invoices/POST";
import invoices_id_delete_226 from "./api/invoices/[id]/DELETE";
import invoices_id_get_227 from "./api/invoices/[id]/GET";
import invoices_id_put_228 from "./api/invoices/[id]/PUT";
import invoices_id_duplicate_post_229 from "./api/invoices/[id]/duplicate/POST";
import invoices_id_export_pdf_get_230 from "./api/invoices/[id]/export-pdf/GET";
import invoices_id_mark_sent_post_231 from "./api/invoices/[id]/mark-sent/POST";
import invoices_id_record_payment_post_232 from "./api/invoices/[id]/record-payment/POST";
import invoices_id_void_post_233 from "./api/invoices/[id]/void/POST";
import job_forms_id_delete_234 from "./api/job-forms/[id]/DELETE";
import job_forms_id_get_235 from "./api/job-forms/[id]/GET";
import job_forms_id_put_236 from "./api/job-forms/[id]/PUT";
import job_forms_id_reset_post_237 from "./api/job-forms/[id]/reset/POST";
import job_forms_id_share_delete_238 from "./api/job-forms/[id]/share/DELETE";
import job_forms_id_share_get_239 from "./api/job-forms/[id]/share/GET";
import job_forms_id_share_post_240 from "./api/job-forms/[id]/share/POST";
import jobs_get_241 from "./api/jobs/GET";
import jobs_post_242 from "./api/jobs/POST";
import jobs_id_get_243 from "./api/jobs/[id]/GET";
import jobs_id_put_244 from "./api/jobs/[id]/PUT";
import jobs_id_attendance_attendanceId_close_post_245 from "./api/jobs/[id]/attendance/[attendanceId]/close/POST";
import jobs_id_costs_get_246 from "./api/jobs/[id]/costs/GET";
import jobs_id_costs_post_247 from "./api/jobs/[id]/costs/POST";
import jobs_id_costs_export_get_248 from "./api/jobs/[id]/costs/export/GET";
import jobs_id_costs_costId_delete_249 from "./api/jobs/[id]/costs/[costId]/DELETE";
import jobs_id_costs_costId_put_250 from "./api/jobs/[id]/costs/[costId]/PUT";
import jobs_id_costs_costId_receipt_get_251 from "./api/jobs/[id]/costs/[costId]/receipt/GET";
import jobs_id_costs_costId_receipt_post_252 from "./api/jobs/[id]/costs/[costId]/receipt/POST";
import jobs_id_delays_get_253 from "./api/jobs/[id]/delays/GET";
import jobs_id_delays_post_254 from "./api/jobs/[id]/delays/POST";
import jobs_id_delays_delayId_delete_255 from "./api/jobs/[id]/delays/[delayId]/DELETE";
import jobs_id_delays_delayId_put_256 from "./api/jobs/[id]/delays/[delayId]/PUT";
import jobs_id_files_get_257 from "./api/jobs/[id]/files/GET";
import jobs_id_forms_get_258 from "./api/jobs/[id]/forms/GET";
import jobs_id_forms_post_259 from "./api/jobs/[id]/forms/POST";
import jobs_id_generate_qr_post_260 from "./api/jobs/[id]/generate-qr/POST";
import jobs_id_ledger_get_261 from "./api/jobs/[id]/ledger/GET";
import jobs_id_ledger_post_262 from "./api/jobs/[id]/ledger/POST";
import jobs_id_ledger_export_get_263 from "./api/jobs/[id]/ledger/export/GET";
import jobs_id_ledger_entryId_delete_265 from "./api/jobs/[id]/ledger/[entryId]/DELETE";
import jobs_id_ledger_entryId_put_266 from "./api/jobs/[id]/ledger/[entryId]/PUT";
import jobs_id_ledger_entryId_correct_post_267 from "./api/jobs/[id]/ledger/[entryId]/correct/POST";
import jobs_id_photos_get_268 from "./api/jobs/[id]/photos/GET";
import jobs_id_photos_post_269 from "./api/jobs/[id]/photos/POST";
import jobs_id_photos_photoId_delete_270 from "./api/jobs/[id]/photos/[photoId]/DELETE";
import jobs_id_photos_photoId_patch_271 from "./api/jobs/[id]/photos/[photoId]/PATCH";
import jobs_id_photos_photoId_download_get_272 from "./api/jobs/[id]/photos/[photoId]/download/GET";
import jobs_id_photos_photoId_replace_post_273 from "./api/jobs/[id]/photos/[photoId]/replace/POST";
import jobs_id_progress_get_274 from "./api/jobs/[id]/progress/GET";
import jobs_id_progress_put_275 from "./api/jobs/[id]/progress/PUT";
import jobs_id_progress_sync_post_276 from "./api/jobs/[id]/progress/sync/POST";
import jobs_id_signin_post_283 from "./api/jobs/[id]/signin/POST";
import jobs_id_signin_qr_post_284 from "./api/jobs/[id]/signin-qr/POST";
import jobs_id_signin_status_get_285 from "./api/jobs/[id]/signin-status/GET";
import jobs_id_signout_post_286 from "./api/jobs/[id]/signout/POST";
import jobs_id_signout_qr_post_287 from "./api/jobs/[id]/signout-qr/POST";
import jobs_id_swms_get_288 from "./api/jobs/[id]/swms/GET";
import jobs_id_swms_post_289 from "./api/jobs/[id]/swms/POST";
import jobs_id_swms_swmsId_signoff_post_290 from "./api/jobs/[id]/swms/[swmsId]/signoff/POST";
import jobs_id_todos_get_291 from "./api/jobs/[id]/todos/GET";
import jobs_id_todos_post_292 from "./api/jobs/[id]/todos/POST";
import jobs_id_todos_todoId_delete_293 from "./api/jobs/[id]/todos/[todoId]/DELETE";
import jobs_id_todos_todoId_put_294 from "./api/jobs/[id]/todos/[todoId]/PUT";
import library_items_get_295 from "./api/library/items/GET";
import library_items_id_get_296 from "./api/library/items/[id]/GET";
import library_items_id_patch_297 from "./api/library/items/[id]/PATCH";
import library_items_id_download_get_298 from "./api/library/items/[id]/download/GET";
import library_items_id_install_post_299 from "./api/library/items/[id]/install/POST";
import library_my_installed_get_300 from "./api/library/my-installed/GET";
import library_my_submissions_get_301 from "./api/library/my-submissions/GET";
import me_get_302 from "./api/me/GET";
import me_put_303 from "./api/me/PUT";
import me_2fa_disable_post_304 from "./api/me/2fa/disable/POST";
import me_2fa_enable_post_305 from "./api/me/2fa/enable/POST";
import me_2fa_setup_get_306 from "./api/me/2fa/setup/GET";
import me_2fa_status_get_307 from "./api/me/2fa/status/GET";
import me_2fa_verify_post_308 from "./api/me/2fa/verify/POST";
import me_change_password_post_309 from "./api/me/change-password/POST";
import me_email_status_get_310 from "./api/me/email-status/GET";
import me_phone_get_311 from "./api/me/phone/GET";
import me_phone_put_312 from "./api/me/phone/PUT";
import notes_get_350 from "./api/notes/GET";
import notes_post_351 from "./api/notes/POST";
import notes_comments_post_352 from "./api/notes/comments/POST";
import notes_migrate_post_353 from "./api/notes/migrate/POST";
import notifications_prefs_get_355 from "./api/notifications/prefs/GET";
import notifications_prefs_put_356 from "./api/notifications/prefs/PUT";
import notifications_read_post_357 from "./api/notifications/read/POST";
import owner_console_activity_get_358 from "./api/owner-console/activity/GET";
import owner_console_cancellation_feedback_get_359 from "./api/owner-console/cancellation-feedback/GET";
import owner_console_companies_get_360 from "./api/owner-console/companies/GET";
import owner_console_companies_post_361 from "./api/owner-console/companies/POST";
import owner_console_companies_usage_get_362 from "./api/owner-console/companies/usage/GET";
import owner_console_companies_id_limits_put_363 from "./api/owner-console/companies/[id]/limits/PUT";
import owner_console_form_templates_get_364 from "./api/owner-console/form-templates/GET";
import owner_console_form_templates_post_365 from "./api/owner-console/form-templates/POST";
import owner_console_library_items_post_366 from "./api/owner-console/library/items/POST";
import owner_console_library_items_id_delete_367 from "./api/owner-console/library/items/[id]/DELETE";
import owner_console_library_items_id_patch_368 from "./api/owner-console/library/items/[id]/PATCH";
import owner_console_library_submissions_get_369 from "./api/owner-console/library/submissions/GET";
import owner_console_library_submissions_id_review_post_370 from "./api/owner-console/library/submissions/[id]/review/POST";
import owner_console_starter_pack_get_371 from "./api/owner-console/starter-pack/GET";
import owner_console_starter_pack_post_372 from "./api/owner-console/starter-pack/POST";
import owner_console_stats_get_373 from "./api/owner-console/stats/GET";
import owner_console_storage_get_374 from "./api/owner-console/storage/GET";
import owner_console_users_get_376 from "./api/owner-console/users/GET";
import owner_console_users_verify_post_377 from "./api/owner-console/users/verify/POST";
import plan_manager_drawings_get_378 from "./api/plan-manager/drawings/GET";
import plan_manager_drawings_post_379 from "./api/plan-manager/drawings/POST";
import plan_manager_drawings_id_get_380 from "./api/plan-manager/drawings/[id]/GET";
import plan_manager_drawings_id_annotations_put_381 from "./api/plan-manager/drawings/[id]/annotations/PUT";
import plan_manager_drawings_id_archive_post_382 from "./api/plan-manager/drawings/[id]/archive/POST";
import plan_manager_drawings_id_job_links_delete_383 from "./api/plan-manager/drawings/[id]/job-links/DELETE";
import plan_manager_drawings_id_job_links_post_384 from "./api/plan-manager/drawings/[id]/job-links/POST";
import plan_manager_drawings_id_pages_pageNo_annotations_get_385 from "./api/plan-manager/drawings/[id]/pages/[pageNo]/annotations/GET";
import plan_manager_drawings_id_permanent_delete_386 from "./api/plan-manager/drawings/[id]/permanent/DELETE";
import plan_manager_drawings_id_reorder_patch_387 from "./api/plan-manager/drawings/[id]/reorder/PATCH";
import plan_manager_drawings_id_restore_post_388 from "./api/plan-manager/drawings/[id]/restore/POST";
import plan_manager_drawings_id_revisions_post_389 from "./api/plan-manager/drawings/[id]/revisions/POST";
import plan_manager_drawings_id_revisions_revisionId_finalize_post_390 from "./api/plan-manager/drawings/[id]/revisions/[revisionId]/finalize/POST";
import plan_manager_drawings_id_upload_post_391 from "./api/plan-manager/drawings/[id]/upload/POST";
import plan_manager_jobs_with_drawings_get_392 from "./api/plan-manager/jobs-with-drawings/GET";
import plan_manager_share_post_393 from "./api/plan-manager/share/POST";
import plan_manager_share_validate_get_394 from "./api/plan-manager/share/validate/GET";
import portal_estimates_id_approve_post_395 from "./api/portal/estimates/[id]/approve/POST";
import portal_invite_post_396 from "./api/portal/invite/POST";
import portal_invoices_id_pay_post_397 from "./api/portal/invoices/[id]/pay/POST";
import portal_jobs_get_398 from "./api/portal/jobs/GET";
import portal_jobs_id_get_399 from "./api/portal/jobs/[id]/GET";
import portal_migrate_post_400 from "./api/portal/migrate/POST";
import portal_validate_post_401 from "./api/portal/validate/POST";
import public_form_token_get_402 from "./api/public/form/[token]/GET";
import public_form_token_submit_post_403 from "./api/public/form/[token]/submit/POST";
import public_swms_token_get_404 from "./api/public/swms/[token]/GET";
import public_swms_token_signoff_post_405 from "./api/public/swms/[token]/signoff/POST";
import push_subscribe_delete_406 from "./api/push/subscribe/DELETE";
import push_subscribe_post_407 from "./api/push/subscribe/POST";
import push_vapid_key_get_408 from "./api/push/vapid-key/GET";
import recipes_get_409 from "./api/recipes/GET";
import recipes_post_410 from "./api/recipes/POST";
import recipes_id_delete_411 from "./api/recipes/[id]/DELETE";
import recipes_id_put_412 from "./api/recipes/[id]/PUT";
import safety_ai_draft_post_413 from "./api/safety/ai/draft/POST";
import safety_documents_get_414 from "./api/safety/documents/GET";
import safety_documents_post_415 from "./api/safety/documents/POST";
import safety_documents_id_delete_416 from "./api/safety/documents/[id]/DELETE";
import safety_documents_id_download_get_417 from "./api/safety/documents/[id]/download/GET";
import safety_generated_posters_get_418 from "./api/safety/generated-posters/GET";
import safety_generated_posters_post_419 from "./api/safety/generated-posters/POST";
import safety_generated_posters_id_delete_420 from "./api/safety/generated-posters/[id]/DELETE";
import safety_job_safety_plans_get_421 from "./api/safety/job-safety-plans/GET";
import safety_job_safety_plans_post_422 from "./api/safety/job-safety-plans/POST";
import safety_job_safety_plans_id_delete_423 from "./api/safety/job-safety-plans/[id]/DELETE";
import safety_job_safety_plans_id_put_424 from "./api/safety/job-safety-plans/[id]/PUT";
import safety_job_swms_get_425 from "./api/safety/job-swms/GET";
import safety_job_swms_post_426 from "./api/safety/job-swms/POST";
import safety_job_swms_id_delete_427 from "./api/safety/job-swms/[id]/DELETE";
import safety_job_swms_id_get_428 from "./api/safety/job-swms/[id]/GET";
import safety_job_swms_id_put_429 from "./api/safety/job-swms/[id]/PUT";
import safety_job_swms_id_share_token_post_430 from "./api/safety/job-swms/[id]/share-token/POST";
import safety_job_swms_id_signoffs_get_431 from "./api/safety/job-swms/[id]/signoffs/GET";
import safety_job_swms_id_signoffs_post_432 from "./api/safety/job-swms/[id]/signoffs/POST";
import safety_job_swms_id_signoffs_signoffId_delete_433 from "./api/safety/job-swms/[id]/signoffs/[signoffId]/DELETE";
import safety_plans_get_434 from "./api/safety/plans/GET";
import safety_plans_post_435 from "./api/safety/plans/POST";
import safety_plans_seed_post_436 from "./api/safety/plans/seed/POST";
import safety_plans_id_delete_437 from "./api/safety/plans/[id]/DELETE";
import safety_plans_id_put_438 from "./api/safety/plans/[id]/PUT";
import safety_plans_id_export_get_439 from "./api/safety/plans/[id]/export/GET";
import safety_plans_id_pack_get_440 from "./api/safety/plans/[id]/pack/GET";
import safety_posters_get_441 from "./api/safety/posters/GET";
import safety_posters_post_442 from "./api/safety/posters/POST";
import safety_posters_id_delete_443 from "./api/safety/posters/[id]/DELETE";
import safety_swms_get_444 from "./api/safety/swms/GET";
import safety_swms_post_445 from "./api/safety/swms/POST";
import safety_swms_import_docx_post_446 from "./api/safety/swms/import-docx/POST";
import safety_swms_seed_post_447 from "./api/safety/swms/seed/POST";
import safety_swms_id_delete_448 from "./api/safety/swms/[id]/DELETE";
import safety_swms_id_get_449 from "./api/safety/swms/[id]/GET";
import safety_swms_id_put_450 from "./api/safety/swms/[id]/PUT";
import safety_swms_id_duplicate_post_451 from "./api/safety/swms/[id]/duplicate/POST";
import safety_swms_id_export_get_452 from "./api/safety/swms/[id]/export/GET";
import scheduler_crew_get_453 from "./api/scheduler/crew/GET";
import scheduler_jobs_get_454 from "./api/scheduler/jobs/GET";
import scheduler_jobs_id_reschedule_patch_455 from "./api/scheduler/jobs/[id]/reschedule/PATCH";
import secure_share_get_456 from "./api/secure-share/GET";
import secure_share_post_457 from "./api/secure-share/POST";
import secure_share_id_delete_458 from "./api/secure-share/[id]/DELETE";
import secure_share_token_get_459 from "./api/secure-share/[token]/GET";
import secure_share_token_post_460 from "./api/secure-share/[token]/POST";
import settings_backup_get_461 from "./api/settings/backup/GET";
import settings_backup_post_462 from "./api/settings/backup/POST";
import settings_backup_export_get_463 from "./api/settings/backup/export/GET";
import settings_backup_run_post_464 from "./api/settings/backup/run/POST";
import settings_backup_destination_get_465 from "./api/settings/backup-destination/GET";
import settings_backup_destination_post_466 from "./api/settings/backup-destination/POST";
import settings_dazza_ai_key_get_467 from "./api/settings/dazza-ai-key/GET";
import settings_dazza_ai_key_post_468 from "./api/settings/dazza-ai-key/POST";
import settings_file_transfer_backup_get_469 from "./api/settings/file-transfer-backup/GET";
import settings_file_transfer_backup_post_470 from "./api/settings/file-transfer-backup/POST";
import settings_retention_get_471 from "./api/settings/retention/GET";
import settings_retention_post_472 from "./api/settings/retention/POST";
import settings_storage_provider_get_473 from "./api/settings/storage-provider/GET";
import settings_storage_provider_debug_get_474 from "./api/settings/storage-provider/debug/GET";
import settings_storage_provider_test_post_475 from "./api/settings/storage-provider/test/POST";
import settings_terminology_get_476 from "./api/settings/terminology/GET";
import settings_terminology_post_477 from "./api/settings/terminology/POST";
import settings_xero_credentials_get_478 from "./api/settings/xero-credentials/GET";
import settings_xero_credentials_post_479 from "./api/settings/xero-credentials/POST";
import share_token_get_480 from "./api/share/[token]/GET";
import signin_history_get_481 from "./api/signin-history/GET";
import signup_post_482 from "./api/signup/POST";
import stripe_create_checkout_session_post_483 from "./api/stripe/create-checkout-session/POST";
import stripe_session_sessionId_get_484 from "./api/stripe/session/[sessionId]/GET";
import subscription_create_checkout_post_485 from "./api/subscription/create-checkout/POST";
import subscription_status_get_486 from "./api/subscription/status/GET";
import subscription_webhook_post_487 from "./api/subscription/webhook/POST";
import support_mode_audit_get_488 from "./api/support-mode/audit/GET";
import support_mode_checklist_get_489 from "./api/support-mode/checklist/GET";
import support_mode_checklist_put_490 from "./api/support-mode/checklist/PUT";
import support_mode_enter_post_491 from "./api/support-mode/enter/POST";
import support_mode_exit_post_492 from "./api/support-mode/exit/POST";
import support_mode_status_get_493 from "./api/support-mode/status/GET";
import tag_tasks_get_494 from "./api/tag-tasks/GET";
import tag_tasks_id_patch_495 from "./api/tag-tasks/[id]/PATCH";
import takeoff_pad_get_496 from "./api/takeoff-pad/GET";
import takeoff_pad_put_497 from "./api/takeoff-pad/PUT";
import team_get_498 from "./api/team/GET";
import team_invite_post_499 from "./api/team/invite/POST";
import team_invites_get_500 from "./api/team/invites/GET";
import team_invites_post_501 from "./api/team/invites/POST";
import team_invites_id_cancel_post_502 from "./api/team/invites/[id]/cancel/POST";
import team_invites_id_resend_post_503 from "./api/team/invites/[id]/resend/POST";
import team_members_get_504 from "./api/team/members/GET";
import team_resend_verification_post_505 from "./api/team/resend-verification/POST";
import team_schedule_migrate_post_506 from "./api/team/schedule/migrate/POST";
import team_shifts_get_507 from "./api/team/shifts/GET";
import team_shifts_post_508 from "./api/team/shifts/POST";
import team_shifts_id_delete_509 from "./api/team/shifts/[id]/DELETE";
import team_shifts_id_put_510 from "./api/team/shifts/[id]/PUT";
import team_time_entries_get_511 from "./api/team/time-entries/GET";
import team_time_entries_post_512 from "./api/team/time-entries/POST";
import team_time_entries_export_get_513 from "./api/team/time-entries/export/GET";
import team_time_entries_id_put_514 from "./api/team/time-entries/[id]/PUT";
import team_verify_user_post_515 from "./api/team/verify-user/POST";
import team_id_delete_516 from "./api/team/[id]/DELETE";
import team_id_put_517 from "./api/team/[id]/PUT";
import usage_get_518 from "./api/usage/GET";
// </api-imports>
// New endpoints — sign-in history, fleet usage export, supervisor force-close
import signin_history_get from "./api/signin-history/GET.js";
import fleet_id_usage_export_get from "./api/fleet/[id]/usage-export/GET.js";
import jobs_id_attendance_close_post from "./api/jobs/[id]/attendance/[attendanceId]/close/POST.js";
// Asset Manager

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
// File uploads use busboy (parseMultipartForm) with its own per-handler limit.
// IMPORTANT: skip JSON / urlencoded parsing for multipart requests so busboy
// can read the raw stream — express.json() drains the body before busboy sees it.
app.use((req: Request, res: Response, next: NextFunction) => {
  const ct = req.headers['content-type'] ?? '';
  if (ct.startsWith('multipart/form-data')) return next();
  express.json({ limit: '2mb' })(req, res, next);
});
app.use((req: Request, res: Response, next: NextFunction) => {
  const ct = req.headers['content-type'] ?? '';
  if (ct.startsWith('multipart/form-data')) return next();
  express.urlencoded({ extended: true, limit: '2mb' })(req, res, next);
});

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

// ── QR attendance — public endpoints (registered BEFORE auth guard) ───────────
// Token-validated inside the handler; guests do not need a portal session.
app.post("/api/jobs/:id/signin-qr",  jobs_id_signin_qr_post_284);
app.post("/api/jobs/:id/signout-qr", jobs_id_signout_qr_post_287);

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
  // QR attendance — token-validated, unauthenticated guests allowed
  // req.path here is relative to /api mount (e.g. /jobs/1/signin-qr)
  if (req.method === 'POST' && /^\/jobs\/[0-9]+\/(signin|signout)-qr$/.test(req.path)) {
    return next();
  }
  // Customer portal routes are token-validated inside their own handlers
  if (req.path.startsWith('/portal/')) {
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

  // 1d. Ensure document_templates exists — explicit early-create so it is
  //     guaranteed on prod DBs that predate the safetyTables loop entry.
  try {
    await db.execute(sql.raw(
      "CREATE TABLE IF NOT EXISTS document_templates (" +
      "  id INT AUTO_INCREMENT PRIMARY KEY," +
      "  company_id INT NOT NULL," +
      "  name VARCHAR(255) NOT NULL," +
      "  template_type VARCHAR(50) NOT NULL DEFAULT 'document'," +
      "  builder_json LONGTEXT NULL," +
      "  page_layout_json TEXT NULL," +
      "  theme_json TEXT NULL," +
      "  source_docx_path VARCHAR(500) NULL," +
      "  source_docx_name VARCHAR(255) NULL," +
      "  is_active TINYINT(1) NOT NULL DEFAULT 1," +
      "  created_by_user_id VARCHAR(36) NULL," +
      "  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP," +
      "  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP," +
      "  INDEX idx_company (company_id)," +
      "  INDEX idx_type (company_id, template_type)," +
      "  INDEX idx_active (company_id, is_active)" +
      ")"
    ));
    console.log('[startup-migration] document_templates table ready');
  } catch (e: unknown) {
    const msg = String((e as Error)?.message ?? e);
    if (!msg.includes('already exists') && !msg.includes('ER_TABLE_EXISTS')) {
      console.warn('[startup-migration] document_templates CREATE failed:', msg);
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
    // ── document_templates: columns added after initial table creation ────────
    { table: 'document_templates', column: 'pdf_settings_json',   definition: 'LONGTEXT NULL' },
    { table: 'document_templates', column: 'source_docx_path',    definition: 'VARCHAR(500) NULL' },
    { table: 'document_templates', column: 'source_docx_name',    definition: 'VARCHAR(255) NULL' },
    // ── project_drawings: columns added after initial table creation ──────────
    { table: 'project_drawings', column: 'name',                  definition: 'VARCHAR(500) NOT NULL DEFAULT \'\'' },
    { table: 'project_drawings', column: 'title',                 definition: 'VARCHAR(500) NOT NULL DEFAULT \'\'' },
    { table: 'project_drawings', column: 'description',           definition: 'TEXT NULL' },
    { table: 'project_drawings', column: 'project_id',            definition: 'INT NULL' },
    { table: 'project_drawings', column: 'source_file_path',      definition: 'VARCHAR(1000) NULL' },
    { table: 'project_drawings', column: 'source_file_name',      definition: 'VARCHAR(500) NULL' },
    { table: 'project_drawings', column: 'page_count',            definition: 'INT NOT NULL DEFAULT 1' },
    { table: 'project_drawings', column: 'current_revision_id',   definition: 'INT NULL' },
    { table: 'project_drawings', column: 'sort_order',            definition: 'INT NOT NULL DEFAULT 0' },
    { table: 'project_drawings', column: 'created_by',            definition: 'VARCHAR(36) NULL' },
    // ── job_drawing_links: columns added after initial table creation ─────────
    { table: 'job_drawing_links', column: 'sort_order',           definition: 'INT NOT NULL DEFAULT 0' },
    { table: 'job_drawing_links', column: 'context_note',         definition: 'TEXT NULL' },
    { table: 'job_drawing_links', column: 'created_by',           definition: 'VARCHAR(36) NULL' },
    // ── drawing_audit_log: revision_id column ────────────────────────────────
    { table: 'drawing_audit_log', column: 'revision_id',          definition: 'INT NULL' },
    // ── jobs: asset link ─────────────────────────────────────────────────────
    { table: 'jobs', column: 'asset_id', definition: 'INT NULL' },
    // ── am_tender_cycles: job link ───────────────────────────────────────────
    { table: 'am_tender_cycles', column: 'job_id', definition: 'INT NULL' },
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
    // ── PWA Push Subscriptions ────────────────────────────────────────────────
    { name: 'push_subscriptions', ddl: "CREATE TABLE IF NOT EXISTS push_subscriptions (id INT AUTO_INCREMENT PRIMARY KEY, user_id VARCHAR(36) NOT NULL, company_id INT NOT NULL, endpoint TEXT NOT NULL, p256dh VARCHAR(255) NOT NULL, auth VARCHAR(255) NOT NULL, revoked TINYINT(1) NOT NULL DEFAULT 0, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, UNIQUE KEY uq_endpoint (endpoint(512)), INDEX idx_user (user_id), INDEX idx_company (company_id))" },
    // ── Asset Manager ─────────────────────────────────────────────────────────
    { name: 'am_assets', ddl: "CREATE TABLE IF NOT EXISTS am_assets (id INT AUTO_INCREMENT PRIMARY KEY, company_id INT NOT NULL, name VARCHAR(255) NOT NULL, acronym VARCHAR(50) NULL, address TEXT NULL, asset_type VARCHAR(60) NOT NULL DEFAULT 'facility', status VARCHAR(40) NOT NULL DEFAULT 'active', created_by VARCHAR(36) NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, archived_at DATETIME NULL, INDEX idx_company (company_id), INDEX idx_status (company_id, status))" },
    { name: 'am_inspections', ddl: "CREATE TABLE IF NOT EXISTS am_inspections (id INT AUTO_INCREMENT PRIMARY KEY, asset_id INT NOT NULL, company_id INT NOT NULL, report_no VARCHAR(100) NULL, inspection_date DATE NULL, report_title VARCHAR(255) NULL, auditor_id VARCHAR(36) NULL, overall_status VARCHAR(40) NOT NULL DEFAULT 'draft', notes TEXT NULL, photos_json LONGTEXT NULL, signed_link_slug VARCHAR(100) NULL, created_by VARCHAR(36) NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, archived_at DATETIME NULL, INDEX idx_asset (asset_id), INDEX idx_company (company_id))" },
    { name: 'am_defects', ddl: "CREATE TABLE IF NOT EXISTS am_defects (id INT AUTO_INCREMENT PRIMARY KEY, inspection_id INT NOT NULL, company_id INT NOT NULL, title VARCHAR(255) NOT NULL, severity VARCHAR(20) NOT NULL DEFAULT 'med', location VARCHAR(255) NULL, description TEXT NULL, action_owner_id VARCHAR(36) NULL, due_date DATE NULL, status VARCHAR(30) NOT NULL DEFAULT 'open', created_by VARCHAR(36) NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, archived_at DATETIME NULL, INDEX idx_inspection (inspection_id), INDEX idx_company (company_id))" },
    { name: 'am_tender_cycles', ddl: "CREATE TABLE IF NOT EXISTS am_tender_cycles (id INT AUTO_INCREMENT PRIMARY KEY, inspection_id INT NULL, asset_id INT NOT NULL, company_id INT NOT NULL, code VARCHAR(100) NULL, quote_requested_at DATE NULL, quote_due_at DATE NULL, contractor_name VARCHAR(255) NULL, quote_amount DECIMAL(12,2) NULL, award_status VARCHAR(30) NOT NULL DEFAULT 'draft', notes TEXT NULL, created_by VARCHAR(36) NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, archived_at DATETIME NULL, INDEX idx_inspection (inspection_id), INDEX idx_asset (asset_id), INDEX idx_company (company_id))" },
    { name: 'am_contract_submissions', ddl: "CREATE TABLE IF NOT EXISTS am_contract_submissions (id INT AUTO_INCREMENT PRIMARY KEY, tender_cycle_id INT NOT NULL, company_id INT NOT NULL, contractor_name VARCHAR(255) NULL, submitted_at DATETIME NULL, documents_json LONGTEXT NULL, status VARCHAR(40) NOT NULL DEFAULT 'received', received_by VARCHAR(36) NULL, notes TEXT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX idx_tender (tender_cycle_id))" },
    { name: 'am_closeout_forms', ddl: "CREATE TABLE IF NOT EXISTS am_closeout_forms (id INT AUTO_INCREMENT PRIMARY KEY, inspection_id INT NOT NULL, company_id INT NOT NULL, form_type VARCHAR(30) NOT NULL DEFAULT 'completion', source_file_path VARCHAR(1000) NULL, extracted_json LONGTEXT NULL, reviewed_by VARCHAR(36) NULL, completed_at DATETIME NULL, created_by VARCHAR(36) NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, archived_at DATETIME NULL, INDEX idx_inspection (inspection_id))" },
    { name: 'am_media', ddl: "CREATE TABLE IF NOT EXISTS am_media (id INT AUTO_INCREMENT PRIMARY KEY, asset_id INT NOT NULL, inspection_id INT NULL, company_id INT NOT NULL, category VARCHAR(40) NOT NULL DEFAULT 'site_photo', file_path VARCHAR(1000) NOT NULL, file_name VARCHAR(255) NOT NULL, mime_type VARCHAR(100) NULL, uploaded_by VARCHAR(36) NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX idx_asset (asset_id), INDEX idx_inspection (inspection_id))" },
    { name: 'am_audit_log', ddl: "CREATE TABLE IF NOT EXISTS am_audit_log (id INT AUTO_INCREMENT PRIMARY KEY, entity_type VARCHAR(40) NOT NULL, entity_id INT NOT NULL, action VARCHAR(80) NOT NULL, actor_id VARCHAR(36) NULL, details_json TEXT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX idx_entity (entity_type, entity_id), INDEX idx_actor (actor_id))" },
    { name: 'am_report_shares', ddl: "CREATE TABLE IF NOT EXISTS am_report_shares (id INT AUTO_INCREMENT PRIMARY KEY, inspection_id INT NOT NULL, company_id INT NOT NULL, token_hash VARCHAR(64) NOT NULL UNIQUE, scope VARCHAR(30) NOT NULL DEFAULT 'read', expires_at DATETIME NULL, revoked TINYINT(1) NOT NULL DEFAULT 0, created_by VARCHAR(36) NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX idx_token (token_hash), INDEX idx_inspection (inspection_id))" },
    // ── Asset Manager: per-asset todos, notes, photos ─────────────────────────
    { name: 'am_asset_todos', ddl: "CREATE TABLE IF NOT EXISTS am_asset_todos (id INT AUTO_INCREMENT PRIMARY KEY, asset_id INT NOT NULL, company_id INT NOT NULL, title VARCHAR(500) NOT NULL, due_date DATE NULL, status VARCHAR(20) NOT NULL DEFAULT 'Open', notes TEXT NULL, created_by VARCHAR(36) NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX idx_asset (asset_id), INDEX idx_company (company_id))" },
    { name: 'am_asset_notes', ddl: "CREATE TABLE IF NOT EXISTS am_asset_notes (id INT AUTO_INCREMENT PRIMARY KEY, asset_id INT NOT NULL, company_id INT NOT NULL, body TEXT NOT NULL, created_by VARCHAR(36) NULL, created_by_name VARCHAR(255) NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX idx_asset (asset_id), INDEX idx_company (company_id))" },
    { name: 'am_asset_photos', ddl: "CREATE TABLE IF NOT EXISTS am_asset_photos (id INT AUTO_INCREMENT PRIMARY KEY, asset_id INT NOT NULL, company_id INT NOT NULL, file_path VARCHAR(1000) NOT NULL, file_name VARCHAR(255) NOT NULL, mime_type VARCHAR(100) NULL, caption TEXT NULL, uploaded_by VARCHAR(36) NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX idx_asset (asset_id), INDEX idx_company (company_id))" },
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

  // ── Permanently set developer/platform-owner accounts to 'owner' plan ────────
  // These emails are the platform developers and should never be on trial limits.
  const developerEmails = ['darylwilliams1581@gmail.com'];
  for (const email of developerEmails) {
    try {
      await db.execute(sql.raw(`
        UPDATE companies c
        SET c.plan = 'owner',
            c.subscription_status = 'active',
            c.trial_ends_at = DATE_ADD(NOW(), INTERVAL 100 YEAR)
        WHERE c.id IN (
          SELECT p.company_id FROM profiles p
          INNER JOIN \`user\` u ON u.id = p.user_id
          WHERE LOWER(u.email) = LOWER('${email.replace(/'/g, "''")}')
        )
        AND (c.plan != 'owner' OR c.subscription_status != 'active')
      `));
      console.log(`[startup-migration] Developer plan ensured for ${email}`);
    } catch (e: unknown) {
      console.warn(`[startup-migration] Developer plan fix failed for ${email}:`, String((e as Error)?.message ?? e));
    }
  }
}

// ── Run migrations at module load time (covers dev HMR + production) ─────────
void runStartupMigrations().catch((e) =>
  console.error('[startup-migration] fatal:', e)
);

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
app.post("/api/active-ping", active_ping_post_0);
app.get("/api/asset-manager/assets", asset_manager_assets_get_1);
app.post("/api/asset-manager/assets", asset_manager_assets_post_2);
app.get("/api/asset-manager/assets/:id", asset_manager_assets_id_get_3);
app.patch("/api/asset-manager/assets/:id", asset_manager_assets_id_patch_4);
app.post("/api/asset-manager/assets/:id/archive", asset_manager_assets_id_archive_post_5);
app.delete("/api/asset-manager/assets/:id/permanent", asset_manager_assets_id_permanent_delete_6);
app.post("/api/asset-manager/assets/:id/restore", asset_manager_assets_id_restore_post_7);
app.get("/api/asset-manager/defects", asset_manager_defects_get_8);
app.patch("/api/asset-manager/defects/:id", asset_manager_defects_id_patch_9);
app.post("/api/asset-manager/defects/:id/archive", asset_manager_defects_id_archive_post_10);
app.get("/api/asset-manager/inspections", asset_manager_inspections_get_11);
app.post("/api/asset-manager/inspections", asset_manager_inspections_post_12);
app.get("/api/asset-manager/inspections/:id", asset_manager_inspections_id_get_13);
app.patch("/api/asset-manager/inspections/:id", asset_manager_inspections_id_patch_14);
app.post("/api/asset-manager/inspections/:id/archive", asset_manager_inspections_id_archive_post_15);
app.post("/api/asset-manager/inspections/:id/closeout", asset_manager_inspections_id_closeout_post_16);
app.post("/api/asset-manager/inspections/:id/defects", asset_manager_inspections_id_defects_post_17);
app.delete("/api/asset-manager/inspections/:id/permanent", asset_manager_inspections_id_permanent_delete_18);
app.post("/api/asset-manager/inspections/:id/photos", asset_manager_inspections_id_photos_post_19);
app.post("/api/asset-manager/inspections/:id/report/share", asset_manager_inspections_id_report_share_post_20);
app.post("/api/asset-manager/inspections/:id/restore", asset_manager_inspections_id_restore_post_21);
app.post("/api/asset-manager/inspections/:id/tenders", asset_manager_inspections_id_tenders_post_22);
app.get("/api/asset-manager/monitoring", asset_manager_monitoring_get_23);
app.get("/api/asset-manager/reports/:shareToken", asset_manager_reports_shareToken_get_24);
app.get("/api/asset-manager/tenders", asset_manager_tenders_get_25);
app.patch("/api/asset-manager/tenders/:id", asset_manager_tenders_id_patch_26);
app.post("/api/asset-manager/tenders/:id/complete", asset_manager_tenders_id_complete_post_27);
app.post("/api/asset-manager/tenders/:id/contracts", asset_manager_tenders_id_contracts_post_28);
app.get("/api/asset-manager/tenders/:id/attachments", asset_manager_tenders_id_attachments_get);
app.post("/api/asset-manager/tenders/:id/attachments", asset_manager_tenders_id_attachments_post);
app.delete("/api/asset-manager/tenders/:id/attachments/:fileId", asset_manager_tenders_id_attachments_fileId_delete);
// ── Asset Manager: per-asset todos / notes / photos ──────────────────────────
app.get("/api/asset-manager/assets/:id/todos", am_assets_id_todos_get);
app.post("/api/asset-manager/assets/:id/todos", am_assets_id_todos_post);
app.put("/api/asset-manager/assets/:id/todos/:todoId", am_assets_id_todos_todoId_put);
app.delete("/api/asset-manager/assets/:id/todos/:todoId", am_assets_id_todos_todoId_delete);
app.get("/api/asset-manager/assets/:id/notes", am_assets_id_notes_get);
app.post("/api/asset-manager/assets/:id/notes", am_assets_id_notes_post);
app.delete("/api/asset-manager/assets/:id/notes/:noteId", am_assets_id_notes_noteId_delete);
app.get("/api/asset-manager/assets/:id/photos", am_assets_id_photos_get);
app.post("/api/asset-manager/assets/:id/photos", am_assets_id_photos_post);
app.delete("/api/asset-manager/assets/:id/photos/:photoId", am_assets_id_photos_photoId_delete);
app.post("/api/auth/change-email", auth_change_email_post_29);
app.post("/api/auth/change-password", auth_change_password_post_30);
app.post("/api/auth/check-signup-status", auth_check_signup_status_post_31);
app.post("/api/auth/forgot-password", auth_forgot_password_post_32);
app.post("/api/auth/pin-login", auth_pin_login_post_33);
app.post("/api/auth/resend-verification", auth_resend_verification_post_34);
app.post("/api/auth/reset-password", auth_reset_password_post_35);
app.post("/api/auth/resume-signup", auth_resume_signup_post_36);
app.post("/api/auth/self-verify", auth_self_verify_post_37);
app.post("/api/auth/send-sms-code", auth_send_sms_code_post_38);
app.get("/api/auth/sms-configured", auth_sms_configured_get_39);
app.post("/api/auth/sms-recovery", auth_sms_recovery_post_40);
app.get("/api/auth/trusted-devices", auth_trusted_devices_get_41);
app.post("/api/auth/trusted-devices", auth_trusted_devices_post_42);
app.delete("/api/auth/trusted-devices/:deviceId", auth_trusted_devices_deviceId_delete_43);
app.get("/api/auth/validate-reset-token", auth_validate_reset_token_get_44);
app.post("/api/auth/verify-email", auth_verify_email_post_45);
app.post("/api/auth/verify-sms-code", auth_verify_sms_code_post_46);
app.get("/api/auth/:action", auth_action_get_47);
app.post("/api/auth/:action", auth_action_post_48);
app.get("/api/auth/:action/:detail", auth_action_detail_get_49);
app.post("/api/auth/:action/:detail", auth_action_detail_post_50);
app.post("/api/billing/cancel-subscription", billing_cancel_subscription_post_51);
app.post("/api/billing/cancellation-feedback", billing_cancellation_feedback_post_52);
app.post("/api/billing/customer-portal", billing_customer_portal_post_53);
app.post("/api/billing/reactivate-subscription", billing_reactivate_subscription_post_54);
app.post("/api/billing/upgrade-subscription", billing_upgrade_subscription_post_55);
app.get("/api/company", company_get_56);
app.put("/api/company", company_put_57);
app.post("/api/company/logo", company_logo_post_58);
app.get("/api/company-settings", company_settings_get_59);
app.put("/api/company-settings", company_settings_put_60);
app.post("/api/contact", contact_post_61);
app.get("/api/cost-guide", cost_guide_get_62);
app.post("/api/cost-guide", cost_guide_post_63);
app.get("/api/cost-guide/export-csv", cost_guide_export_csv_get_64);
app.post("/api/cost-guide/import-csv", cost_guide_import_csv_post_65);
app.delete("/api/cost-guide/:id", cost_guide_id_delete_66);
app.put("/api/cost-guide/:id", cost_guide_id_put_67);
app.get("/api/customers", customers_get_68);
app.post("/api/customers", customers_post_69);
app.delete("/api/customers/:id", customers_id_delete_70);
app.get("/api/customers/:id", customers_id_get_71);
app.put("/api/customers/:id", customers_id_put_72);
app.get("/api/dashboard/kpi", dashboard_kpi_get_73);
app.get("/api/dashboard/setup-check", dashboard_setup_check_get_74);
app.get("/api/dashboard/todos", dashboard_todos_get_75);
app.post("/api/dazza/annette", /* @vite-ignore */ async (req, res, next) => { try { const _m = await import("./api/dazza/annette/POST.js"); return _m.default(req, res, next); } catch(_e) { next(_e); } });
app.post("/api/dazza/brain/hive/approve", dazza_brain_hive_approve_post_77);
app.post("/api/dazza/brain/hive/reject", dazza_brain_hive_reject_post_78);
app.get("/api/dazza/brain/status", dazza_brain_status_get_79);
app.post("/api/dazza/chat", /* @vite-ignore */ async (req, res, next) => { try { const _m = await import("./api/dazza/chat/POST.js"); return _m.default(req, res, next); } catch(_e) { next(_e); } });
app.post("/api/dazza/chat-v2", /* @vite-ignore */ async (req, res, next) => { try { const _m = await import("./api/dazza/chat-v2/POST.js"); return _m.default(req, res, next); } catch(_e) { next(_e); } });
app.post("/api/dazza/chat-v2/stream", /* @vite-ignore */ async (req, res, next) => { try { const _m = await import("./api/dazza/chat-v2/stream/POST.js"); return _m.default(req, res, next); } catch(_e) { next(_e); } });
app.get("/api/dazza/context", dazza_context_get_83);
app.get("/api/dazza/key-status", dazza_key_status_get_84);
app.get("/api/dazza/knowledge", dazza_knowledge_get_85);
app.post("/api/dazza/knowledge", dazza_knowledge_post_86);
app.delete("/api/dazza/knowledge/:id", dazza_knowledge_id_delete_87);
app.put("/api/dazza/knowledge/:id", dazza_knowledge_id_put_88);
app.get("/api/developer/activity-log", developer_activity_log_get_89);
app.get("/api/developer/audit-log", developer_audit_log_get_90);
app.post("/api/developer/companies/:id/archive", developer_companies_id_archive_post_91);
app.get("/api/developer/company-health", developer_company_health_get_92);
app.get("/api/developer/email-log", developer_email_log_get_93);
app.get("/api/developer/email-settings", developer_email_settings_get_94);
app.put("/api/developer/email-settings", developer_email_settings_put_95);
app.post("/api/developer/email-settings/test", developer_email_settings_test_post_96);
app.get("/api/developer/support-notes", developer_support_notes_get_97);
app.post("/api/developer/support-notes", developer_support_notes_post_98);
app.delete("/api/developer/support-notes/:id", developer_support_notes_id_delete_99);
app.post("/api/developer/users/:id/assign-company", developer_users_id_assign_company_post_100);
app.post("/api/developer/users/:id/deactivate", developer_users_id_deactivate_post_101);
app.post("/api/developer/users/:id/delete-orphan", developer_users_id_delete_orphan_post_102);
app.post("/api/developer/users/:id/force-temp-password", developer_users_id_force_temp_password_post_103);
app.delete("/api/developer/users/:id/impersonate", developer_users_id_impersonate_delete_104);
app.post("/api/developer/users/:id/impersonate", developer_users_id_impersonate_post_105);
app.post("/api/developer/users/:id/reactivate", developer_users_id_reactivate_post_106);
app.post("/api/developer/users/:id/resend-verification", developer_users_id_resend_verification_post_107);
app.put("/api/developer/users/:id/role", developer_users_id_role_put_108);
app.post("/api/developer/users/:id/send-reset-email", developer_users_id_send_reset_email_post_109);
app.delete("/api/developer/users/:id/sessions", developer_users_id_sessions_delete_110);
app.get("/api/developer/users/:id/sessions", developer_users_id_sessions_get_111);
app.post("/api/developer/users/:id/unlock-account", developer_users_id_unlock_account_post_112);
app.get("/api/document-templates", document_templates_get_113);
app.post("/api/document-templates", document_templates_post_114);
app.delete("/api/document-templates/:id", document_templates_id_delete_115);
app.get("/api/document-templates/:id", document_templates_id_get_116);
app.put("/api/document-templates/:id", document_templates_id_put_117);
app.post("/api/document-templates/:id/duplicate", document_templates_id_duplicate_post_118);
app.get("/api/document-templates/:id/export/docx", /* @vite-ignore */ async (req, res, next) => { try { const _m = await import("./api/document-templates/[id]/export/docx/GET.js"); return _m.default(req, res, next); } catch(_e) { next(_e); } });
app.get("/api/document-templates/:id/export/pdf", /* @vite-ignore */ async (req, res, next) => { try { const _m = await import("./api/document-templates/[id]/export/pdf/GET.js"); return _m.default(req, res, next); } catch(_e) { next(_e); } });
app.post("/api/document-templates/:id/import-blocks", document_templates_id_import_blocks_post_121);
app.post("/api/document-templates/:id/import-docx", document_templates_id_import_docx_post_122);
app.post("/api/document-templates/:id/import-pdf", document_templates_id_import_pdf_post_123);
app.post("/api/document-templates/:id/publish-to-library", document_templates_id_publish_to_library_post_124);
app.get("/api/documents", documents_get_125);
app.get("/api/documents/share/:token", documents_share_token_get_126);
app.post("/api/documents/share/:token", documents_share_token_post_127);
app.get("/api/documents/:id", documents_id_get_128);
app.put("/api/documents/:id", documents_id_put_129);
app.get("/api/documents/:id/events", documents_id_events_get_130);
app.delete("/api/documents/:id/share", documents_id_share_delete_131);
app.post("/api/documents/:id/share", documents_id_share_post_132);
app.get("/api/drawings", drawings_get_133);
app.post("/api/drawings", drawings_post_134);
app.post("/api/drawings/upload", drawings_upload_post_135);
app.delete("/api/drawings/:id", drawings_id_delete_136);
app.patch("/api/drawings/:id", drawings_id_patch_137);
app.post("/api/drawings/:id/markup", drawings_id_markup_post_138);
app.get("/api/emergency-alerts", emergency_alerts_get_139);
app.post("/api/emergency-alerts", emergency_alerts_post_140);
app.put("/api/emergency-alerts/:id", emergency_alerts_id_put_141);
app.get("/api/estimates", estimates_get_142);
app.post("/api/estimates", estimates_post_143);
app.delete("/api/estimates/:id", estimates_id_delete_144);
app.get("/api/estimates/:id", estimates_id_get_145);
app.put("/api/estimates/:id", estimates_id_put_146);
app.get("/api/estimates/:id/export-csv", estimates_id_export_csv_get_147);
app.get("/api/estimates/:id/export-pdf", estimates_id_export_pdf_get_148);
app.post("/api/estimates/:id/import-csv", estimates_id_import_csv_post_149);
app.get("/api/external/form/:token", external_form_token_get_150);
app.post("/api/external/form/:token", external_form_token_post_151);
app.get("/api/files", files_get_152);
app.post("/api/files", files_post_153);
app.delete("/api/files/:id", files_id_delete_154);
app.get("/api/files/:id/download", files_id_download_get_155);
app.get("/api/fleet", fleet_get_156);
app.post("/api/fleet", fleet_post_157);
app.get("/api/fleet/analytics-settings", fleet_analytics_settings_get_158);
app.put("/api/fleet/analytics-settings", fleet_analytics_settings_put_159);
app.post("/api/fleet/driver-sessions", fleet_driver_sessions_post_160);
app.get("/api/fleet/driver-sessions/active", fleet_driver_sessions_active_get_161);
app.get("/api/fleet/driver-sessions/live", fleet_driver_sessions_live_get_162);
app.post("/api/fleet/driver-sessions/:id/stop", fleet_driver_sessions_id_stop_post_163);
app.get("/api/fleet/driver-sessions/:id/summary", fleet_driver_sessions_id_summary_get_164);
app.post("/api/fleet/driver-sessions/:id/telemetry", fleet_driver_sessions_id_telemetry_post_165);
app.get("/api/fleet/driver-sessions/:id/telemetry/latest", fleet_driver_sessions_id_telemetry_latest_get_166);
app.get("/api/fleet/flags", fleet_flags_get_167);
app.delete("/api/fleet/service-logs/:logId", fleet_service_logs_logId_delete_168);
app.patch("/api/fleet/service-logs/:logId", fleet_service_logs_logId_patch_169);
app.get("/api/fleet/vehicles", fleet_vehicles_get_170);
app.delete("/api/fleet/:id", fleet_id_delete_171);
app.get("/api/fleet/:id", fleet_id_get_172);
app.put("/api/fleet/:id", fleet_id_put_173);
app.get("/api/fleet/:id/driver-sessions", fleet_id_driver_sessions_get_174);
app.get("/api/fleet/:id/files", fleet_id_files_get_175);
app.get("/api/fleet/:id/prestarts", fleet_id_prestarts_get_176);
app.post("/api/fleet/:id/prestarts", fleet_id_prestarts_post_177);
app.get("/api/fleet/:id/service-logs", fleet_id_service_logs_get_178);
app.post("/api/fleet/:id/service-logs", fleet_id_service_logs_post_179);
app.post("/api/fleet/:id/signin", fleet_id_signin_post_180);
app.post("/api/fleet/:id/signout", fleet_id_signout_post_181);
app.get("/api/fleet/:id/usage-export", fleet_id_usage_export_get_182);
app.get("/api/fleet/:id/usage-status", fleet_id_usage_status_get_183);
app.get("/api/fleet/:id/usage-summary", fleet_id_usage_summary_get_184);
app.get("/api/form-templates", form_templates_get_185);
app.post("/api/form-templates", form_templates_post_186);
app.post("/api/form-templates/seed", /* @vite-ignore */ async (req, res, next) => { try { const _m = await import("./api/form-templates/seed/POST.js"); return _m.default(req, res, next); } catch(_e) { next(_e); } });
app.delete("/api/form-templates/:id", form_templates_id_delete_188);
app.put("/api/form-templates/:id", form_templates_id_put_189);
app.post("/api/forms/migrate-skip-logic", forms_migrate_skip_logic_post_190);
app.get("/api/forms/skip-audit", forms_skip_audit_get_191);
app.post("/api/forms/skip-audit", forms_skip_audit_post_192);
app.get("/api/forms/submissions", forms_submissions_get_193);
app.post("/api/forms/templates/:id/share-link", forms_templates_id_share_link_post_194);
app.get("/api/forms/:id/fields", forms_id_fields_get_195);
app.post("/api/forms/:id/fields", forms_id_fields_post_196);
app.post("/api/forms/:id/fields/reorder", forms_id_fields_reorder_post_197);
app.delete("/api/forms/:id/fields/:fieldId", forms_id_fields_fieldId_delete_198);
app.patch("/api/forms/:id/fields/:fieldId", forms_id_fields_fieldId_patch_199);
app.post("/api/forms/:id/fields/:fieldId/thumbnail", forms_id_fields_fieldId_thumbnail_post_200);
app.get("/api/health", health_get_201);
app.get("/api/integrations/myob/auth-url", integrations_myob_auth_url_get_202);
app.get("/api/integrations/myob/callback", integrations_myob_callback_get_203);
app.post("/api/integrations/myob/disconnect", integrations_myob_disconnect_post_204);
app.get("/api/integrations/myob/status", integrations_myob_status_get_205);
app.post("/api/integrations/myob/sync-invoice", integrations_myob_sync_invoice_post_206);
app.get("/api/integrations/onedrive/auth-url", integrations_onedrive_auth_url_get_207);
app.get("/api/integrations/onedrive/callback", integrations_onedrive_callback_get_208);
app.post("/api/integrations/onedrive/disconnect", integrations_onedrive_disconnect_post_209);
app.get("/api/integrations/onedrive/status", integrations_onedrive_status_get_210);
app.post("/api/integrations/onedrive/upload-file", integrations_onedrive_upload_file_post_211);
app.get("/api/integrations/qbo/auth-url", integrations_qbo_auth_url_get_212);
app.get("/api/integrations/qbo/callback", integrations_qbo_callback_get_213);
app.post("/api/integrations/qbo/disconnect", integrations_qbo_disconnect_post_214);
app.get("/api/integrations/qbo/status", integrations_qbo_status_get_215);
app.post("/api/integrations/qbo/sync-invoice", integrations_qbo_sync_invoice_post_216);
app.get("/api/integrations/xero/auth-url", integrations_xero_auth_url_get_217);
app.get("/api/integrations/xero/callback", integrations_xero_callback_get_218);
app.post("/api/integrations/xero/disconnect", integrations_xero_disconnect_post_219);
app.get("/api/integrations/xero/status", integrations_xero_status_get_220);
app.post("/api/integrations/xero/sync-customer", integrations_xero_sync_customer_post_221);
app.post("/api/integrations/xero/sync-invoice", integrations_xero_sync_invoice_post_222);
app.post("/api/integrations/xero/webhook", integrations_xero_webhook_post_223);
app.get("/api/invoices", invoices_get_224);
app.post("/api/invoices", invoices_post_225);
app.delete("/api/invoices/:id", invoices_id_delete_226);
app.get("/api/invoices/:id", invoices_id_get_227);
app.put("/api/invoices/:id", invoices_id_put_228);
app.post("/api/invoices/:id/duplicate", invoices_id_duplicate_post_229);
app.get("/api/invoices/:id/export-pdf", invoices_id_export_pdf_get_230);
app.post("/api/invoices/:id/mark-sent", invoices_id_mark_sent_post_231);
app.post("/api/invoices/:id/record-payment", invoices_id_record_payment_post_232);
app.post("/api/invoices/:id/void", invoices_id_void_post_233);
app.delete("/api/job-forms/:id", job_forms_id_delete_234);
app.get("/api/job-forms/:id", job_forms_id_get_235);
app.put("/api/job-forms/:id", job_forms_id_put_236);
app.post("/api/job-forms/:id/reset", job_forms_id_reset_post_237);
app.delete("/api/job-forms/:id/share", job_forms_id_share_delete_238);
app.get("/api/job-forms/:id/share", job_forms_id_share_get_239);
app.post("/api/job-forms/:id/share", job_forms_id_share_post_240);
app.get("/api/jobs", jobs_get_241);
app.post("/api/jobs", jobs_post_242);
app.get("/api/jobs/:id", jobs_id_get_243);
app.put("/api/jobs/:id", jobs_id_put_244);
app.post("/api/jobs/:id/attendance/:attendanceId/close", jobs_id_attendance_attendanceId_close_post_245);
app.get("/api/jobs/:id/costs", jobs_id_costs_get_246);
app.post("/api/jobs/:id/costs", jobs_id_costs_post_247);
app.get("/api/jobs/:id/costs/export", jobs_id_costs_export_get_248);
app.delete("/api/jobs/:id/costs/:costId", jobs_id_costs_costId_delete_249);
app.put("/api/jobs/:id/costs/:costId", jobs_id_costs_costId_put_250);
app.get("/api/jobs/:id/costs/:costId/receipt", jobs_id_costs_costId_receipt_get_251);
app.post("/api/jobs/:id/costs/:costId/receipt", jobs_id_costs_costId_receipt_post_252);
app.get("/api/jobs/:id/delays", jobs_id_delays_get_253);
app.post("/api/jobs/:id/delays", jobs_id_delays_post_254);
app.delete("/api/jobs/:id/delays/:delayId", jobs_id_delays_delayId_delete_255);
app.put("/api/jobs/:id/delays/:delayId", jobs_id_delays_delayId_put_256);
app.get("/api/jobs/:id/files", jobs_id_files_get_257);
app.get("/api/jobs/:id/forms", jobs_id_forms_get_258);
app.post("/api/jobs/:id/forms", jobs_id_forms_post_259);
app.post("/api/jobs/:id/generate-qr", jobs_id_generate_qr_post_260);
app.get("/api/jobs/:id/ledger", jobs_id_ledger_get_261);
app.post("/api/jobs/:id/ledger", jobs_id_ledger_post_262);
app.get("/api/jobs/:id/ledger/export", jobs_id_ledger_export_get_263);
app.post("/api/jobs/:id/ledger/sync", /* @vite-ignore */ async (req, res, next) => { try { const _m = await import("./api/jobs/[id]/ledger/sync/POST.js"); return _m.default(req, res, next); } catch(_e) { next(_e); } });
app.delete("/api/jobs/:id/ledger/:entryId", jobs_id_ledger_entryId_delete_265);
app.put("/api/jobs/:id/ledger/:entryId", jobs_id_ledger_entryId_put_266);
app.post("/api/jobs/:id/ledger/:entryId/correct", jobs_id_ledger_entryId_correct_post_267);
app.get("/api/jobs/:id/photos", jobs_id_photos_get_268);
app.post("/api/jobs/:id/photos", jobs_id_photos_post_269);
app.delete("/api/jobs/:id/photos/:photoId", jobs_id_photos_photoId_delete_270);
app.patch("/api/jobs/:id/photos/:photoId", jobs_id_photos_photoId_patch_271);
app.get("/api/jobs/:id/photos/:photoId/download", jobs_id_photos_photoId_download_get_272);
app.post("/api/jobs/:id/photos/:photoId/replace", jobs_id_photos_photoId_replace_post_273);
app.get("/api/jobs/:id/progress", jobs_id_progress_get_274);
app.put("/api/jobs/:id/progress", jobs_id_progress_put_275);
app.post("/api/jobs/:id/progress/sync", jobs_id_progress_sync_post_276);
app.get("/api/jobs/:id/purchase-orders", /* @vite-ignore */ async (req, res, next) => { try { const _m = await import("./api/jobs/[id]/purchase-orders/GET.js"); return _m.default(req, res, next); } catch(_e) { next(_e); } });
app.post("/api/jobs/:id/purchase-orders", /* @vite-ignore */ async (req, res, next) => { try { const _m = await import("./api/jobs/[id]/purchase-orders/POST.js"); return _m.default(req, res, next); } catch(_e) { next(_e); } });
app.delete("/api/jobs/:id/purchase-orders/:poId", /* @vite-ignore */ async (req, res, next) => { try { const _m = await import("./api/jobs/[id]/purchase-orders/[poId]/DELETE.js"); return _m.default(req, res, next); } catch(_e) { next(_e); } });
app.get("/api/jobs/:id/purchase-orders/:poId", /* @vite-ignore */ async (req, res, next) => { try { const _m = await import("./api/jobs/[id]/purchase-orders/[poId]/GET.js"); return _m.default(req, res, next); } catch(_e) { next(_e); } });
app.put("/api/jobs/:id/purchase-orders/:poId", /* @vite-ignore */ async (req, res, next) => { try { const _m = await import("./api/jobs/[id]/purchase-orders/[poId]/PUT.js"); return _m.default(req, res, next); } catch(_e) { next(_e); } });
app.get("/api/jobs/:id/purchase-orders/:poId/pdf", /* @vite-ignore */ async (req, res, next) => { try { const _m = await import("./api/jobs/[id]/purchase-orders/[poId]/pdf/GET.js"); return _m.default(req, res, next); } catch(_e) { next(_e); } });
app.post("/api/jobs/:id/signin", jobs_id_signin_post_283);
app.post("/api/jobs/:id/signin-qr", jobs_id_signin_qr_post_284);
app.get("/api/jobs/:id/signin-status", jobs_id_signin_status_get_285);
app.post("/api/jobs/:id/signout", jobs_id_signout_post_286);
app.post("/api/jobs/:id/signout-qr", jobs_id_signout_qr_post_287);
app.get("/api/jobs/:id/swms", jobs_id_swms_get_288);
app.post("/api/jobs/:id/swms", jobs_id_swms_post_289);
app.post("/api/jobs/:id/swms/:swmsId/signoff", jobs_id_swms_swmsId_signoff_post_290);
app.get("/api/jobs/:id/todos", jobs_id_todos_get_291);
app.post("/api/jobs/:id/todos", jobs_id_todos_post_292);
app.delete("/api/jobs/:id/todos/:todoId", jobs_id_todos_todoId_delete_293);
app.put("/api/jobs/:id/todos/:todoId", jobs_id_todos_todoId_put_294);
app.get("/api/library/items", library_items_get_295);
app.get("/api/library/items/:id", library_items_id_get_296);
app.patch("/api/library/items/:id", library_items_id_patch_297);
app.get("/api/library/items/:id/download", library_items_id_download_get_298);
app.post("/api/library/items/:id/install", library_items_id_install_post_299);
app.get("/api/library/my-installed", library_my_installed_get_300);
app.get("/api/library/my-submissions", library_my_submissions_get_301);
app.get("/api/me", me_get_302);
app.put("/api/me", me_put_303);
app.post("/api/me/2fa/disable", me_2fa_disable_post_304);
app.post("/api/me/2fa/enable", me_2fa_enable_post_305);
app.get("/api/me/2fa/setup", me_2fa_setup_get_306);
app.get("/api/me/2fa/status", me_2fa_status_get_307);
app.post("/api/me/2fa/verify", me_2fa_verify_post_308);
app.post("/api/me/change-password", me_change_password_post_309);
app.get("/api/me/email-status", me_email_status_get_310);
app.get("/api/me/phone", me_phone_get_311);
app.put("/api/me/phone", me_phone_put_312);
app.post("/api/migrate-account-recovery", /* @vite-ignore */ async (req, res, next) => { try { const _m = await import("./api/migrate-account-recovery/POST.js"); return _m.default(req, res, next); } catch(_e) { next(_e); } });
app.post("/api/migrate-asset-manager", /* @vite-ignore */ async (req, res, next) => { try { const _m = await import("./api/migrate-asset-manager/POST.js"); return _m.default(req, res, next); } catch(_e) { next(_e); } });
app.post("/api/migrate-attendance", /* @vite-ignore */ async (req, res, next) => { try { const _m = await import("./api/migrate-attendance/POST.js"); return _m.default(req, res, next); } catch(_e) { next(_e); } });
app.post("/api/migrate-company-settings", /* @vite-ignore */ async (req, res, next) => { try { const _m = await import("./api/migrate-company-settings/POST.js"); return _m.default(req, res, next); } catch(_e) { next(_e); } });
app.post("/api/migrate-dazza-audit", /* @vite-ignore */ async (req, res, next) => { try { const _m = await import("./api/migrate-dazza-audit/POST.js"); return _m.default(req, res, next); } catch(_e) { next(_e); } });
app.post("/api/migrate-dazza-knowledge", /* @vite-ignore */ async (req, res, next) => { try { const _m = await import("./api/migrate-dazza-knowledge/POST.js"); return _m.default(req, res, next); } catch(_e) { next(_e); } });
app.post("/api/migrate-emergency-alerts", /* @vite-ignore */ async (req, res, next) => { try { const _m = await import("./api/migrate-emergency-alerts/POST.js"); return _m.default(req, res, next); } catch(_e) { next(_e); } });
app.post("/api/migrate-estimates", /* @vite-ignore */ async (req, res, next) => { try { const _m = await import("./api/migrate-estimates/POST.js"); return _m.default(req, res, next); } catch(_e) { next(_e); } });
app.post("/api/migrate-estimating-library", /* @vite-ignore */ async (req, res, next) => { try { const _m = await import("./api/migrate-estimating-library/POST.js"); return _m.default(req, res, next); } catch(_e) { next(_e); } });
app.post("/api/migrate-files", /* @vite-ignore */ async (req, res, next) => { try { const _m = await import("./api/migrate-files/POST.js"); return _m.default(req, res, next); } catch(_e) { next(_e); } });
app.post("/api/migrate-fleet", /* @vite-ignore */ async (req, res, next) => { try { const _m = await import("./api/migrate-fleet/POST.js"); return _m.default(req, res, next); } catch(_e) { next(_e); } });
app.post("/api/migrate-fleet-analytics", /* @vite-ignore */ async (req, res, next) => { try { const _m = await import("./api/migrate-fleet-analytics/POST.js"); return _m.default(req, res, next); } catch(_e) { next(_e); } });
app.post("/api/migrate-fleet-driver-sessions", /* @vite-ignore */ async (req, res, next) => { try { const _m = await import("./api/migrate-fleet-driver-sessions/POST.js"); return _m.default(req, res, next); } catch(_e) { next(_e); } });
app.post("/api/migrate-fleet-usage", /* @vite-ignore */ async (req, res, next) => { try { const _m = await import("./api/migrate-fleet-usage/POST.js"); return _m.default(req, res, next); } catch(_e) { next(_e); } });
app.post("/api/migrate-form-fields", /* @vite-ignore */ async (req, res, next) => { try { const _m = await import("./api/migrate-form-fields/POST.js"); return _m.default(req, res, next); } catch(_e) { next(_e); } });
app.post("/api/migrate-form-logic", /* @vite-ignore */ async (req, res, next) => { try { const _m = await import("./api/migrate-form-logic/POST.js"); return _m.default(req, res, next); } catch(_e) { next(_e); } });
app.post("/api/migrate-form-templates", /* @vite-ignore */ async (req, res, next) => { try { const _m = await import("./api/migrate-form-templates/POST.js"); return _m.default(req, res, next); } catch(_e) { next(_e); } });
app.post("/api/migrate-job-forms", /* @vite-ignore */ async (req, res, next) => { try { const _m = await import("./api/migrate-job-forms/POST.js"); return _m.default(req, res, next); } catch(_e) { next(_e); } });
app.post("/api/migrate-job-photos", /* @vite-ignore */ async (req, res, next) => { try { const _m = await import("./api/migrate-job-photos/POST.js"); return _m.default(req, res, next); } catch(_e) { next(_e); } });
app.post("/api/migrate-job-tabs", /* @vite-ignore */ async (req, res, next) => { try { const _m = await import("./api/migrate-job-tabs/POST.js"); return _m.default(req, res, next); } catch(_e) { next(_e); } });
app.post("/api/migrate-jobs", /* @vite-ignore */ async (req, res, next) => { try { const _m = await import("./api/migrate-jobs/POST.js"); return _m.default(req, res, next); } catch(_e) { next(_e); } });
app.post("/api/migrate-library", /* @vite-ignore */ async (req, res, next) => { try { const _m = await import("./api/migrate-library/POST.js"); return _m.default(req, res, next); } catch(_e) { next(_e); } });
app.post("/api/migrate-library-downloads", /* @vite-ignore */ async (req, res, next) => { try { const _m = await import("./api/migrate-library-downloads/POST.js"); return _m.default(req, res, next); } catch(_e) { next(_e); } });
app.post("/api/migrate-notifications", /* @vite-ignore */ async (req, res, next) => { try { const _m = await import("./api/migrate-notifications/POST.js"); return _m.default(req, res, next); } catch(_e) { next(_e); } });
app.post("/api/migrate-owner-console", /* @vite-ignore */ async (req, res, next) => { try { const _m = await import("./api/migrate-owner-console/POST.js"); return _m.default(req, res, next); } catch(_e) { next(_e); } });
app.post("/api/migrate-owner-role", /* @vite-ignore */ async (req, res, next) => { try { const _m = await import("./api/migrate-owner-role/POST.js"); return _m.default(req, res, next); } catch(_e) { next(_e); } });
app.post("/api/migrate-pdf-settings", /* @vite-ignore */ async (req, res, next) => { try { const _m = await import("./api/migrate-pdf-settings/POST.js"); return _m.default(req, res, next); } catch(_e) { next(_e); } });
app.post("/api/migrate-plan-manager", /* @vite-ignore */ async (req, res, next) => { try { const _m = await import("./api/migrate-plan-manager/POST.js"); return _m.default(req, res, next); } catch(_e) { next(_e); } });
app.post("/api/migrate-plan-manager-v2", /* @vite-ignore */ async (req, res, next) => { try { const _m = await import("./api/migrate-plan-manager-v2/POST.js"); return _m.default(req, res, next); } catch(_e) { next(_e); } });
app.post("/api/migrate-plan-manager-v3", /* @vite-ignore */ async (req, res, next) => { try { const _m = await import("./api/migrate-plan-manager-v3/POST.js"); return _m.default(req, res, next); } catch(_e) { next(_e); } });
app.post("/api/migrate-safety", /* @vite-ignore */ async (req, res, next) => { try { const _m = await import("./api/migrate-safety/POST.js"); return _m.default(req, res, next); } catch(_e) { next(_e); } });
app.post("/api/migrate-starter-pack", /* @vite-ignore */ async (req, res, next) => { try { const _m = await import("./api/migrate-starter-pack/POST.js"); return _m.default(req, res, next); } catch(_e) { next(_e); } });
app.post("/api/migrate-studio-pdf", /* @vite-ignore */ async (req, res, next) => { try { const _m = await import("./api/migrate-studio-pdf/POST.js"); return _m.default(req, res, next); } catch(_e) { next(_e); } });
app.post("/api/migrate-subscriptions", /* @vite-ignore */ async (req, res, next) => { try { const _m = await import("./api/migrate-subscriptions/POST.js"); return _m.default(req, res, next); } catch(_e) { next(_e); } });
app.post("/api/migrate-support-mode", /* @vite-ignore */ async (req, res, next) => { try { const _m = await import("./api/migrate-support-mode/POST.js"); return _m.default(req, res, next); } catch(_e) { next(_e); } });
app.post("/api/migrate-takeoff-pad", /* @vite-ignore */ async (req, res, next) => { try { const _m = await import("./api/migrate-takeoff-pad/POST.js"); return _m.default(req, res, next); } catch(_e) { next(_e); } });
app.post("/api/migrate-team", /* @vite-ignore */ async (req, res, next) => { try { const _m = await import("./api/migrate-team/POST.js"); return _m.default(req, res, next); } catch(_e) { next(_e); } });
app.get("/api/notes", notes_get_350);
app.post("/api/notes", notes_post_351);
app.post("/api/notes/comments", notes_comments_post_352);
app.post("/api/notes/migrate", notes_migrate_post_353);
app.get("/api/notifications/alerts", /* @vite-ignore */ async (req, res, next) => { try { const _m = await import("./api/notifications/alerts/GET.js"); return _m.default(req, res, next); } catch(_e) { next(_e); } });
app.get("/api/notifications/prefs", notifications_prefs_get_355);
app.put("/api/notifications/prefs", notifications_prefs_put_356);
app.post("/api/notifications/read", notifications_read_post_357);
app.get("/api/owner-console/activity", owner_console_activity_get_358);
app.get("/api/owner-console/cancellation-feedback", owner_console_cancellation_feedback_get_359);
app.get("/api/owner-console/companies", owner_console_companies_get_360);
app.post("/api/owner-console/companies", owner_console_companies_post_361);
app.get("/api/owner-console/companies/usage", owner_console_companies_usage_get_362);
app.put("/api/owner-console/companies/:id/limits", owner_console_companies_id_limits_put_363);
app.get("/api/owner-console/form-templates", owner_console_form_templates_get_364);
app.post("/api/owner-console/form-templates", owner_console_form_templates_post_365);
app.post("/api/owner-console/library/items", owner_console_library_items_post_366);
app.delete("/api/owner-console/library/items/:id", owner_console_library_items_id_delete_367);
app.patch("/api/owner-console/library/items/:id", owner_console_library_items_id_patch_368);
app.get("/api/owner-console/library/submissions", owner_console_library_submissions_get_369);
app.post("/api/owner-console/library/submissions/:id/review", owner_console_library_submissions_id_review_post_370);
app.get("/api/owner-console/starter-pack", owner_console_starter_pack_get_371);
app.post("/api/owner-console/starter-pack", owner_console_starter_pack_post_372);
app.get("/api/owner-console/stats", owner_console_stats_get_373);
app.get("/api/owner-console/storage", owner_console_storage_get_374);
app.post("/api/owner-console/system-ai/builtin-checks", /* @vite-ignore */ async (req, res, next) => { try { const _m = await import("./api/owner-console/system-ai/builtin-checks/POST.js"); return _m.default(req, res, next); } catch(_e) { next(_e); } });
app.get("/api/owner-console/users", owner_console_users_get_376);
app.post("/api/owner-console/users/verify", owner_console_users_verify_post_377);
app.get("/api/plan-manager/drawings", plan_manager_drawings_get_378);
app.post("/api/plan-manager/drawings", plan_manager_drawings_post_379);
app.get("/api/plan-manager/drawings/:id", plan_manager_drawings_id_get_380);
app.put("/api/plan-manager/drawings/:id/annotations", plan_manager_drawings_id_annotations_put_381);
app.post("/api/plan-manager/drawings/:id/archive", plan_manager_drawings_id_archive_post_382);
app.delete("/api/plan-manager/drawings/:id/job-links", plan_manager_drawings_id_job_links_delete_383);
app.post("/api/plan-manager/drawings/:id/job-links", plan_manager_drawings_id_job_links_post_384);
app.get("/api/plan-manager/drawings/:id/pages/:pageNo/annotations", plan_manager_drawings_id_pages_pageNo_annotations_get_385);
app.delete("/api/plan-manager/drawings/:id/permanent", plan_manager_drawings_id_permanent_delete_386);
app.patch("/api/plan-manager/drawings/:id/reorder", plan_manager_drawings_id_reorder_patch_387);
app.post("/api/plan-manager/drawings/:id/restore", plan_manager_drawings_id_restore_post_388);
app.post("/api/plan-manager/drawings/:id/revisions", plan_manager_drawings_id_revisions_post_389);
app.post("/api/plan-manager/drawings/:id/revisions/:revisionId/finalize", plan_manager_drawings_id_revisions_revisionId_finalize_post_390);
app.post("/api/plan-manager/drawings/:id/upload", plan_manager_drawings_id_upload_post_391);
app.get("/api/plan-manager/jobs-with-drawings", plan_manager_jobs_with_drawings_get_392);
app.post("/api/plan-manager/share", plan_manager_share_post_393);
app.get("/api/plan-manager/share/validate", plan_manager_share_validate_get_394);
app.post("/api/portal/estimates/:id/approve", portal_estimates_id_approve_post_395);
app.post("/api/portal/invite", portal_invite_post_396);
app.post("/api/portal/invoices/:id/pay", portal_invoices_id_pay_post_397);
app.get("/api/portal/jobs", portal_jobs_get_398);
app.get("/api/portal/jobs/:id", portal_jobs_id_get_399);
app.post("/api/portal/migrate", portal_migrate_post_400);
app.post("/api/portal/validate", portal_validate_post_401);
app.get("/api/public/form/:token", public_form_token_get_402);
app.post("/api/public/form/:token/submit", public_form_token_submit_post_403);
app.get("/api/public/swms/:token", public_swms_token_get_404);
app.post("/api/public/swms/:token/signoff", public_swms_token_signoff_post_405);
app.delete("/api/push/subscribe", push_subscribe_delete_406);
app.post("/api/push/subscribe", push_subscribe_post_407);
app.get("/api/push/vapid-key", push_vapid_key_get_408);
app.get("/api/recipes", recipes_get_409);
app.post("/api/recipes", recipes_post_410);
app.delete("/api/recipes/:id", recipes_id_delete_411);
app.put("/api/recipes/:id", recipes_id_put_412);
app.post("/api/safety/ai/draft", safety_ai_draft_post_413);
app.get("/api/safety/documents", safety_documents_get_414);
app.post("/api/safety/documents", safety_documents_post_415);
app.delete("/api/safety/documents/:id", safety_documents_id_delete_416);
app.get("/api/safety/documents/:id/download", safety_documents_id_download_get_417);
app.get("/api/safety/generated-posters", safety_generated_posters_get_418);
app.post("/api/safety/generated-posters", safety_generated_posters_post_419);
app.delete("/api/safety/generated-posters/:id", safety_generated_posters_id_delete_420);
app.get("/api/safety/job-safety-plans", safety_job_safety_plans_get_421);
app.post("/api/safety/job-safety-plans", safety_job_safety_plans_post_422);
app.delete("/api/safety/job-safety-plans/:id", safety_job_safety_plans_id_delete_423);
app.put("/api/safety/job-safety-plans/:id", safety_job_safety_plans_id_put_424);
app.get("/api/safety/job-swms", safety_job_swms_get_425);
app.post("/api/safety/job-swms", safety_job_swms_post_426);
app.delete("/api/safety/job-swms/:id", safety_job_swms_id_delete_427);
app.get("/api/safety/job-swms/:id", safety_job_swms_id_get_428);
app.put("/api/safety/job-swms/:id", safety_job_swms_id_put_429);
app.post("/api/safety/job-swms/:id/share-token", safety_job_swms_id_share_token_post_430);
app.get("/api/safety/job-swms/:id/signoffs", safety_job_swms_id_signoffs_get_431);
app.post("/api/safety/job-swms/:id/signoffs", safety_job_swms_id_signoffs_post_432);
app.delete("/api/safety/job-swms/:id/signoffs/:signoffId", safety_job_swms_id_signoffs_signoffId_delete_433);
app.get("/api/safety/plans", safety_plans_get_434);
app.post("/api/safety/plans", safety_plans_post_435);
app.post("/api/safety/plans/seed", safety_plans_seed_post_436);
app.delete("/api/safety/plans/:id", safety_plans_id_delete_437);
app.put("/api/safety/plans/:id", safety_plans_id_put_438);
app.get("/api/safety/plans/:id/export", safety_plans_id_export_get_439);
app.get("/api/safety/plans/:id/pack", safety_plans_id_pack_get_440);
app.get("/api/safety/posters", safety_posters_get_441);
app.post("/api/safety/posters", safety_posters_post_442);
app.delete("/api/safety/posters/:id", safety_posters_id_delete_443);
app.get("/api/safety/swms", safety_swms_get_444);
app.post("/api/safety/swms", safety_swms_post_445);
app.post("/api/safety/swms/import-docx", safety_swms_import_docx_post_446);
app.post("/api/safety/swms/seed", safety_swms_seed_post_447);
app.delete("/api/safety/swms/:id", safety_swms_id_delete_448);
app.get("/api/safety/swms/:id", safety_swms_id_get_449);
app.put("/api/safety/swms/:id", safety_swms_id_put_450);
app.post("/api/safety/swms/:id/duplicate", safety_swms_id_duplicate_post_451);
app.get("/api/safety/swms/:id/export", safety_swms_id_export_get_452);
app.get("/api/scheduler/crew", scheduler_crew_get_453);
app.get("/api/scheduler/jobs", scheduler_jobs_get_454);
app.patch("/api/scheduler/jobs/:id/reschedule", scheduler_jobs_id_reschedule_patch_455);
app.get("/api/secure-share", secure_share_get_456);
app.post("/api/secure-share", secure_share_post_457);
app.delete("/api/secure-share/:id", secure_share_id_delete_458);
app.get("/api/secure-share/:token", secure_share_token_get_459);
app.post("/api/secure-share/:token", secure_share_token_post_460);
app.get("/api/settings/backup", settings_backup_get_461);
app.post("/api/settings/backup", settings_backup_post_462);
app.get("/api/settings/backup/export", settings_backup_export_get_463);
app.post("/api/settings/backup/run", settings_backup_run_post_464);
app.get("/api/settings/backup-destination", settings_backup_destination_get_465);
app.post("/api/settings/backup-destination", settings_backup_destination_post_466);
app.get("/api/settings/dazza-ai-key", settings_dazza_ai_key_get_467);
app.post("/api/settings/dazza-ai-key", settings_dazza_ai_key_post_468);
app.get("/api/settings/file-transfer-backup", settings_file_transfer_backup_get_469);
app.post("/api/settings/file-transfer-backup", settings_file_transfer_backup_post_470);
app.get("/api/settings/retention", settings_retention_get_471);
app.post("/api/settings/retention", settings_retention_post_472);
app.get("/api/settings/storage-provider", settings_storage_provider_get_473);
app.get("/api/settings/storage-provider/debug", settings_storage_provider_debug_get_474);
app.post("/api/settings/storage-provider/test", settings_storage_provider_test_post_475);
app.get("/api/settings/terminology", settings_terminology_get_476);
app.post("/api/settings/terminology", settings_terminology_post_477);
app.get("/api/settings/xero-credentials", settings_xero_credentials_get_478);
app.post("/api/settings/xero-credentials", settings_xero_credentials_post_479);
app.get("/api/share/:token", share_token_get_480);
app.get("/api/signin-history", signin_history_get_481);
app.post("/api/signup", signup_post_482);
app.post("/api/stripe/create-checkout-session", stripe_create_checkout_session_post_483);
app.get("/api/stripe/session/:sessionId", stripe_session_sessionId_get_484);
app.post("/api/subscription/create-checkout", subscription_create_checkout_post_485);
app.get("/api/subscription/status", subscription_status_get_486);
app.post("/api/subscription/webhook", subscription_webhook_post_487);
app.get("/api/support-mode/audit", support_mode_audit_get_488);
app.get("/api/support-mode/checklist", support_mode_checklist_get_489);
app.put("/api/support-mode/checklist", support_mode_checklist_put_490);
app.post("/api/support-mode/enter", support_mode_enter_post_491);
app.post("/api/support-mode/exit", support_mode_exit_post_492);
app.get("/api/support-mode/status", support_mode_status_get_493);
app.get("/api/tag-tasks", tag_tasks_get_494);
app.patch("/api/tag-tasks/:id", tag_tasks_id_patch_495);
app.get("/api/takeoff-pad", takeoff_pad_get_496);
app.put("/api/takeoff-pad", takeoff_pad_put_497);
app.get("/api/team", team_get_498);
app.post("/api/team/invite", team_invite_post_499);
app.get("/api/team/invites", team_invites_get_500);
app.post("/api/team/invites", team_invites_post_501);
app.post("/api/team/invites/:id/cancel", team_invites_id_cancel_post_502);
app.post("/api/team/invites/:id/resend", team_invites_id_resend_post_503);
app.get("/api/team/members", team_members_get_504);
app.post("/api/team/resend-verification", team_resend_verification_post_505);
app.post("/api/team/schedule/migrate", team_schedule_migrate_post_506);
app.get("/api/team/shifts", team_shifts_get_507);
app.post("/api/team/shifts", team_shifts_post_508);
app.delete("/api/team/shifts/:id", team_shifts_id_delete_509);
app.put("/api/team/shifts/:id", team_shifts_id_put_510);
app.get("/api/team/time-entries", team_time_entries_get_511);
app.post("/api/team/time-entries", team_time_entries_post_512);
app.get("/api/team/time-entries/export", team_time_entries_export_get_513);
app.put("/api/team/time-entries/:id", team_time_entries_id_put_514);
app.post("/api/team/verify-user", team_verify_user_post_515);
app.delete("/api/team/:id", team_id_delete_516);
app.put("/api/team/:id", team_id_put_517);
app.get("/api/usage", usage_get_518);
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

	// entry-server is statically imported at the top of this file as
	// _entryServerModule — Rollup inlines it directly into server.bundle.mjs
	// so there is no separate dist/bin/entry-server-HASH.js chunk.
	// This eliminates the stale-chunk crash that occurred when the platform
	// overlaid new archives on old filesystems without cleaning dist/bin/.
	const renderFn: ((url: string) => Promise<SsrRenderResult>) | null =
		typeof _entryServerModule?.render === "function"
			? (_entryServerModule.render as (url: string) => Promise<SsrRenderResult>)
			: null;
	if (renderFn === null) {
		console.error("ssr.module.load-failed", {
			error: "entry-server static import did not export a render function",
			exported: Object.keys(_entryServerModule ?? {}),
		});
		process.exit(1);
	}

	app.get(/.*/, async (req, res, next) => {
		if (req.method !== "GET") return next();
		if (req.path.startsWith("/api")) return next();
		if (extname(req.path)) return next();
		const sendFallback = () =>
			res
				// 200 so the platform health check passes even when SSR is degraded.
				// The client-side React bundle hydrates and the app works normally.
				// A 503 here causes the platform health check to fail and roll back
				// the deploy, which is worse than serving a client-rendered shell.
				.status(200)
				.set("Content-Type", "text/html; charset=utf-8")
				.set("Cache-Control", "no-store")
				.send(fallbackShell);
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
			// Hoist db/sql imports once — avoids 5 redundant dynamic module
			// evaluations and keeps Rollup's chunk graph clean.
			const { db: _db } = await import('./db/client.js');
			const { sql: _sql } = await import('drizzle-orm');

			try {
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

		// ── Run the full self-healing migration suite (safetyTables loop etc.) ──
		await runStartupMigrations();

		// ── project_drawings (full canonical schema) ──────────────────────────
		try {
			await _db.execute(_sql.raw(
				"CREATE TABLE IF NOT EXISTS project_drawings (" +
				"  id INT AUTO_INCREMENT PRIMARY KEY," +
				"  company_id INT NOT NULL," +
				"  project_id INT NULL," +
				"  name VARCHAR(500) NOT NULL DEFAULT ''," +
				"  title VARCHAR(500) NOT NULL DEFAULT ''," +
				"  description TEXT NULL," +
				"  source_file_path VARCHAR(1000) NULL," +
				"  source_file_name VARCHAR(500) NULL," +
				"  page_count INT NOT NULL DEFAULT 1," +
				"  current_revision_id INT NULL," +
				"  status VARCHAR(30) NOT NULL DEFAULT 'active'," +
				"  sort_order INT NOT NULL DEFAULT 0," +
				"  created_by VARCHAR(36) NULL," +
				"  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP," +
				"  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP," +
				"  INDEX idx_pd_company (company_id)," +
				"  INDEX idx_pd_project (company_id, project_id)," +
				"  INDEX idx_pd_status (company_id, status)" +
				") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
			));
			console.log('[startup] project_drawings table ready');
		} catch (e) {
			console.warn('[startup] project_drawings migration skipped:', (e as Error)?.message?.slice(0, 120));
		}

		// ── job_drawing_links (full canonical schema) ─────────────────────────
		try {
			await _db.execute(_sql.raw(
				"CREATE TABLE IF NOT EXISTS job_drawing_links (" +
				"  id INT AUTO_INCREMENT PRIMARY KEY," +
				"  job_id INT NOT NULL," +
				"  drawing_id INT NOT NULL," +
				"  context_note TEXT NULL," +
				"  sort_order INT NOT NULL DEFAULT 0," +
				"  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP," +
				"  created_by VARCHAR(36) NULL," +
				"  UNIQUE KEY uq_jdl_job_drawing (job_id, drawing_id)," +
				"  INDEX idx_jdl_job (job_id)," +
				"  INDEX idx_jdl_drawing (drawing_id)" +
				") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
			));
			console.log('[startup] job_drawing_links table ready');
		} catch (e) {
			console.warn('[startup] job_drawing_links migration skipped:', (e as Error)?.message?.slice(0, 120));
		}

		// ── document_templates (full canonical schema) ───────────────────────
		try {
			await _db.execute(_sql.raw(
				"CREATE TABLE IF NOT EXISTS document_templates (" +
				"  id INT AUTO_INCREMENT PRIMARY KEY," +
				"  company_id INT NOT NULL," +
				"  name VARCHAR(255) NOT NULL," +
				"  template_type VARCHAR(50) NOT NULL DEFAULT 'document'," +
				"  builder_json LONGTEXT NULL," +
				"  page_layout_json TEXT NULL," +
				"  theme_json TEXT NULL," +
				"  pdf_settings_json LONGTEXT NULL," +
				"  source_docx_path VARCHAR(500) NULL," +
				"  source_docx_name VARCHAR(255) NULL," +
				"  is_active TINYINT(1) NOT NULL DEFAULT 1," +
				"  created_by_user_id VARCHAR(36) NULL," +
				"  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP," +
				"  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP," +
				"  INDEX idx_dt_company (company_id)," +
				"  INDEX idx_dt_type (company_id, template_type)," +
				"  INDEX idx_dt_active (company_id, is_active)" +
				") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
			));
			console.log('[startup] document_templates table ready');
		} catch (e) {
			console.warn('[startup] document_templates migration skipped:', (e as Error)?.message?.slice(0, 120));
		}

		// ── drawing_audit_log (full canonical schema) ─────────────────────────
		try {
			await _db.execute(_sql.raw(
				"CREATE TABLE IF NOT EXISTS drawing_audit_log (" +
				"  id INT AUTO_INCREMENT PRIMARY KEY," +
				"  drawing_id INT NOT NULL," +
				"  revision_id INT NULL," +
				"  actor_id VARCHAR(36) NULL," +
				"  action VARCHAR(60) NOT NULL," +
				"  details_json TEXT NULL," +
				"  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP," +
				"  INDEX idx_dal_drawing (drawing_id)," +
				"  INDEX idx_dal_created (drawing_id, created_at)" +
				") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
			));
			console.log('[startup] drawing_audit_log table ready');
		} catch (e) {
			console.warn('[startup] drawing_audit_log migration skipped:', (e as Error)?.message?.slice(0, 120));
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
