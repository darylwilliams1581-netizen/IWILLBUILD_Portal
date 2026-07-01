import express, { type Express, type NextFunction, type Request, type Response } from "express";
import { fileURLToPath } from "node:url";
import { dirname, extname, join } from "node:path";
import { readFileSync } from "node:fs";
import { getSecret } from '#airo/secrets';
import { globalApiLimiter, authApiLimiter } from './lib/api-rate-limiter.js';
import { requirePlatformOwner } from './lib/platform-owner-guard.js';

// <api-imports>
import active_ping_post_0 from "./api/active-ping/POST";
import auth_change_email_post_1 from "./api/auth/change-email/POST";
import auth_forgot_password_post_2 from "./api/auth/forgot-password/POST";
import auth_pin_login_post_3 from "./api/auth/pin-login/POST";
import auth_resend_verification_post_4 from "./api/auth/resend-verification/POST";
import auth_reset_password_post_5 from "./api/auth/reset-password/POST";
import auth_self_verify_post_6 from "./api/auth/self-verify/POST";
import auth_send_sms_code_post_7 from "./api/auth/send-sms-code/POST";
import auth_sms_configured_get_8 from "./api/auth/sms-configured/GET";
import auth_sms_recovery_post_9 from "./api/auth/sms-recovery/POST";
import auth_trusted_devices_get_10 from "./api/auth/trusted-devices/GET";
import auth_trusted_devices_post_11 from "./api/auth/trusted-devices/POST";
import auth_trusted_devices_deviceId_delete_12 from "./api/auth/trusted-devices/[deviceId]/DELETE";
import auth_validate_reset_token_get_13 from "./api/auth/validate-reset-token/GET";
import auth_verify_email_post_14 from "./api/auth/verify-email/POST";
import auth_verify_sms_code_post_15 from "./api/auth/verify-sms-code/POST";
import auth_action_get_16 from "./api/auth/[action]/GET";
import auth_action_post_17 from "./api/auth/[action]/POST";
import auth_action_detail_get_18 from "./api/auth/[action]/[detail]/GET";
import auth_action_detail_post_19 from "./api/auth/[action]/[detail]/POST";
import billing_cancel_subscription_post_20 from "./api/billing/cancel-subscription/POST";
import billing_cancellation_feedback_post_21 from "./api/billing/cancellation-feedback/POST";
import billing_customer_portal_post_22 from "./api/billing/customer-portal/POST";
import billing_reactivate_subscription_post_23 from "./api/billing/reactivate-subscription/POST";
import billing_upgrade_subscription_post_24 from "./api/billing/upgrade-subscription/POST";
import company_get_25 from "./api/company/GET";
import company_put_26 from "./api/company/PUT";
import company_settings_get_27 from "./api/company-settings/GET";
import company_settings_put_28 from "./api/company-settings/PUT";
import contact_post_29 from "./api/contact/POST";
import cost_guide_get_30 from "./api/cost-guide/GET";
import cost_guide_post_31 from "./api/cost-guide/POST";
import cost_guide_export_csv_get_32 from "./api/cost-guide/export-csv/GET";
import cost_guide_import_csv_post_33 from "./api/cost-guide/import-csv/POST";
import cost_guide_id_delete_34 from "./api/cost-guide/[id]/DELETE";
import cost_guide_id_put_35 from "./api/cost-guide/[id]/PUT";
import customers_get_36 from "./api/customers/GET";
import customers_post_37 from "./api/customers/POST";
import customers_id_delete_38 from "./api/customers/[id]/DELETE";
import customers_id_get_39 from "./api/customers/[id]/GET";
import customers_id_put_40 from "./api/customers/[id]/PUT";
import dashboard_setup_check_get_41 from "./api/dashboard/setup-check/GET";
import dashboard_todos_get_42 from "./api/dashboard/todos/GET";
import dazza_annette_post_43 from "./api/dazza/annette/POST";
import dazza_brain_hive_approve_post_44 from "./api/dazza/brain/hive/approve/POST";
import dazza_brain_hive_reject_post_45 from "./api/dazza/brain/hive/reject/POST";
import dazza_brain_status_get_46 from "./api/dazza/brain/status/GET";
import dazza_chat_post_47 from "./api/dazza/chat/POST";
import dazza_context_get_48 from "./api/dazza/context/GET";
import dazza_key_status_get_49 from "./api/dazza/key-status/GET";
import dazza_knowledge_get_50 from "./api/dazza/knowledge/GET";
import dazza_knowledge_post_51 from "./api/dazza/knowledge/POST";
import dazza_knowledge_id_delete_52 from "./api/dazza/knowledge/[id]/DELETE";
import dazza_knowledge_id_put_53 from "./api/dazza/knowledge/[id]/PUT";
import documents_get_54 from "./api/documents/GET";
import documents_share_token_get_55 from "./api/documents/share/[token]/GET";
import documents_share_token_post_56 from "./api/documents/share/[token]/POST";
import documents_id_get_57 from "./api/documents/[id]/GET";
import documents_id_put_58 from "./api/documents/[id]/PUT";
import documents_id_events_get_59 from "./api/documents/[id]/events/GET";
import documents_id_share_delete_60 from "./api/documents/[id]/share/DELETE";
import documents_id_share_post_61 from "./api/documents/[id]/share/POST";
import drawings_get_62 from "./api/drawings/GET";
import drawings_post_63 from "./api/drawings/POST";
import drawings_upload_post_64 from "./api/drawings/upload/POST";
import drawings_id_delete_65 from "./api/drawings/[id]/DELETE";
import drawings_id_patch_66 from "./api/drawings/[id]/PATCH";
import drawings_id_markup_post_67 from "./api/drawings/[id]/markup/POST";
import estimates_get_68 from "./api/estimates/GET";
import estimates_post_69 from "./api/estimates/POST";
import estimates_id_delete_70 from "./api/estimates/[id]/DELETE";
import estimates_id_get_71 from "./api/estimates/[id]/GET";
import estimates_id_put_72 from "./api/estimates/[id]/PUT";
import estimates_id_export_csv_get_73 from "./api/estimates/[id]/export-csv/GET";
import estimates_id_import_csv_post_74 from "./api/estimates/[id]/import-csv/POST";
import external_form_token_get_75 from "./api/external/form/[token]/GET";
import external_form_token_post_76 from "./api/external/form/[token]/POST";
import files_get_77 from "./api/files/GET";
import files_post_78 from "./api/files/POST";
import files_id_delete_79 from "./api/files/[id]/DELETE";
import files_id_download_get_80 from "./api/files/[id]/download/GET";
import fleet_get_81 from "./api/fleet/GET";
import fleet_post_82 from "./api/fleet/POST";
import fleet_driver_sessions_post_83 from "./api/fleet/driver-sessions/POST";
import fleet_driver_sessions_active_get_84 from "./api/fleet/driver-sessions/active/GET";
import fleet_driver_sessions_id_stop_post_85 from "./api/fleet/driver-sessions/[id]/stop/POST";
import fleet_flags_get_86 from "./api/fleet/flags/GET";
import fleet_vehicles_get_87 from "./api/fleet/vehicles/GET";
import fleet_id_get_88 from "./api/fleet/[id]/GET";
import fleet_id_put_89 from "./api/fleet/[id]/PUT";
import fleet_id_driver_sessions_get_90 from "./api/fleet/[id]/driver-sessions/GET";
import fleet_id_files_get_91 from "./api/fleet/[id]/files/GET";
import fleet_id_prestarts_get_92 from "./api/fleet/[id]/prestarts/GET";
import fleet_id_prestarts_post_93 from "./api/fleet/[id]/prestarts/POST";
import form_templates_get_94 from "./api/form-templates/GET";
import form_templates_post_95 from "./api/form-templates/POST";
import form_templates_seed_post_96 from "./api/form-templates/seed/POST";
import form_templates_id_delete_97 from "./api/form-templates/[id]/DELETE";
import form_templates_id_put_98 from "./api/form-templates/[id]/PUT";
import forms_id_fields_get_99 from "./api/forms/[id]/fields/GET";
import forms_id_fields_post_100 from "./api/forms/[id]/fields/POST";
import forms_id_fields_reorder_post_101 from "./api/forms/[id]/fields/reorder/POST";
import forms_id_fields_fieldId_delete_102 from "./api/forms/[id]/fields/[fieldId]/DELETE";
import forms_id_fields_fieldId_patch_103 from "./api/forms/[id]/fields/[fieldId]/PATCH";
import forms_id_fields_fieldId_thumbnail_post_104 from "./api/forms/[id]/fields/[fieldId]/thumbnail/POST";
import health_get_105 from "./api/health/GET";
import integrations_onedrive_auth_url_get_106 from "./api/integrations/onedrive/auth-url/GET";
import integrations_onedrive_callback_get_107 from "./api/integrations/onedrive/callback/GET";
import integrations_onedrive_disconnect_post_108 from "./api/integrations/onedrive/disconnect/POST";
import integrations_onedrive_status_get_109 from "./api/integrations/onedrive/status/GET";
import integrations_onedrive_upload_file_post_110 from "./api/integrations/onedrive/upload-file/POST";
import integrations_xero_auth_url_get_111 from "./api/integrations/xero/auth-url/GET";
import integrations_xero_callback_get_112 from "./api/integrations/xero/callback/GET";
import integrations_xero_disconnect_post_113 from "./api/integrations/xero/disconnect/POST";
import integrations_xero_status_get_114 from "./api/integrations/xero/status/GET";
import integrations_xero_sync_customer_post_115 from "./api/integrations/xero/sync-customer/POST";
import integrations_xero_sync_invoice_post_116 from "./api/integrations/xero/sync-invoice/POST";
import integrations_xero_webhook_post_117 from "./api/integrations/xero/webhook/POST";
import invoices_get_118 from "./api/invoices/GET";
import invoices_post_119 from "./api/invoices/POST";
import invoices_id_delete_120 from "./api/invoices/[id]/DELETE";
import invoices_id_get_121 from "./api/invoices/[id]/GET";
import invoices_id_put_122 from "./api/invoices/[id]/PUT";
import invoices_id_duplicate_post_123 from "./api/invoices/[id]/duplicate/POST";
import invoices_id_mark_sent_post_124 from "./api/invoices/[id]/mark-sent/POST";
import invoices_id_record_payment_post_125 from "./api/invoices/[id]/record-payment/POST";
import invoices_id_void_post_126 from "./api/invoices/[id]/void/POST";
import job_forms_id_delete_127 from "./api/job-forms/[id]/DELETE";
import job_forms_id_get_128 from "./api/job-forms/[id]/GET";
import job_forms_id_put_129 from "./api/job-forms/[id]/PUT";
import job_forms_id_reset_post_130 from "./api/job-forms/[id]/reset/POST";
import job_forms_id_share_delete_131 from "./api/job-forms/[id]/share/DELETE";
import job_forms_id_share_get_132 from "./api/job-forms/[id]/share/GET";
import job_forms_id_share_post_133 from "./api/job-forms/[id]/share/POST";
import jobs_get_134 from "./api/jobs/GET";
import jobs_post_135 from "./api/jobs/POST";
import jobs_id_get_136 from "./api/jobs/[id]/GET";
import jobs_id_put_137 from "./api/jobs/[id]/PUT";
import jobs_id_costs_get_138 from "./api/jobs/[id]/costs/GET";
import jobs_id_costs_post_139 from "./api/jobs/[id]/costs/POST";
import jobs_id_costs_export_get_140 from "./api/jobs/[id]/costs/export/GET";
import jobs_id_costs_costId_delete_141 from "./api/jobs/[id]/costs/[costId]/DELETE";
import jobs_id_costs_costId_put_142 from "./api/jobs/[id]/costs/[costId]/PUT";
import jobs_id_costs_costId_receipt_get_143 from "./api/jobs/[id]/costs/[costId]/receipt/GET";
import jobs_id_costs_costId_receipt_post_144 from "./api/jobs/[id]/costs/[costId]/receipt/POST";
import jobs_id_delays_get_145 from "./api/jobs/[id]/delays/GET";
import jobs_id_delays_post_146 from "./api/jobs/[id]/delays/POST";
import jobs_id_delays_delayId_delete_147 from "./api/jobs/[id]/delays/[delayId]/DELETE";
import jobs_id_delays_delayId_put_148 from "./api/jobs/[id]/delays/[delayId]/PUT";
import jobs_id_files_get_149 from "./api/jobs/[id]/files/GET";
import jobs_id_forms_get_150 from "./api/jobs/[id]/forms/GET";
import jobs_id_forms_post_151 from "./api/jobs/[id]/forms/POST";
import jobs_id_ledger_get_152 from "./api/jobs/[id]/ledger/GET";
import jobs_id_ledger_post_153 from "./api/jobs/[id]/ledger/POST";
import jobs_id_ledger_export_get_154 from "./api/jobs/[id]/ledger/export/GET";
import jobs_id_ledger_sync_post_155 from "./api/jobs/[id]/ledger/sync/POST";
import jobs_id_ledger_entryId_delete_156 from "./api/jobs/[id]/ledger/[entryId]/DELETE";
import jobs_id_ledger_entryId_put_157 from "./api/jobs/[id]/ledger/[entryId]/PUT";
import jobs_id_photos_get_158 from "./api/jobs/[id]/photos/GET";
import jobs_id_photos_post_159 from "./api/jobs/[id]/photos/POST";
import jobs_id_photos_photoId_delete_160 from "./api/jobs/[id]/photos/[photoId]/DELETE";
import jobs_id_photos_photoId_patch_161 from "./api/jobs/[id]/photos/[photoId]/PATCH";
import jobs_id_photos_photoId_download_get_162 from "./api/jobs/[id]/photos/[photoId]/download/GET";
import jobs_id_photos_photoId_replace_post_163 from "./api/jobs/[id]/photos/[photoId]/replace/POST";
import jobs_id_progress_get_164 from "./api/jobs/[id]/progress/GET";
import jobs_id_progress_put_165 from "./api/jobs/[id]/progress/PUT";
import jobs_id_progress_sync_post_166 from "./api/jobs/[id]/progress/sync/POST";
import jobs_id_purchase_orders_get_167 from "./api/jobs/[id]/purchase-orders/GET";
import jobs_id_purchase_orders_post_168 from "./api/jobs/[id]/purchase-orders/POST";
import jobs_id_purchase_orders_poId_delete_169 from "./api/jobs/[id]/purchase-orders/[poId]/DELETE";
import jobs_id_purchase_orders_poId_get_170 from "./api/jobs/[id]/purchase-orders/[poId]/GET";
import jobs_id_purchase_orders_poId_put_171 from "./api/jobs/[id]/purchase-orders/[poId]/PUT";
import jobs_id_purchase_orders_poId_pdf_get_172 from "./api/jobs/[id]/purchase-orders/[poId]/pdf/GET";
import jobs_id_swms_get_173 from "./api/jobs/[id]/swms/GET";
import jobs_id_swms_post_174 from "./api/jobs/[id]/swms/POST";
import jobs_id_swms_swmsId_signoff_post_175 from "./api/jobs/[id]/swms/[swmsId]/signoff/POST";
import jobs_id_todos_get_176 from "./api/jobs/[id]/todos/GET";
import jobs_id_todos_post_177 from "./api/jobs/[id]/todos/POST";
import jobs_id_todos_todoId_delete_178 from "./api/jobs/[id]/todos/[todoId]/DELETE";
import jobs_id_todos_todoId_put_179 from "./api/jobs/[id]/todos/[todoId]/PUT";
import me_get_180 from "./api/me/GET";
import me_put_181 from "./api/me/PUT";
import me_2fa_disable_post_182 from "./api/me/2fa/disable/POST";
import me_2fa_enable_post_183 from "./api/me/2fa/enable/POST";
import me_2fa_setup_get_184 from "./api/me/2fa/setup/GET";
import me_2fa_status_get_185 from "./api/me/2fa/status/GET";
import me_2fa_verify_post_186 from "./api/me/2fa/verify/POST";
import me_change_password_post_187 from "./api/me/change-password/POST";
import me_email_status_get_188 from "./api/me/email-status/GET";
import me_phone_get_189 from "./api/me/phone/GET";
import me_phone_put_190 from "./api/me/phone/PUT";
import migrate_account_recovery_post_191 from "./api/migrate-account-recovery/POST";
import migrate_company_settings_post_192 from "./api/migrate-company-settings/POST";
import migrate_dazza_audit_post_193 from "./api/migrate-dazza-audit/POST";
import migrate_dazza_knowledge_post_194 from "./api/migrate-dazza-knowledge/POST";
import migrate_estimates_post_195 from "./api/migrate-estimates/POST";
import migrate_estimating_library_post_196 from "./api/migrate-estimating-library/POST";
import migrate_files_post_197 from "./api/migrate-files/POST";
import migrate_fleet_post_198 from "./api/migrate-fleet/POST";
import migrate_fleet_driver_sessions_post_199 from "./api/migrate-fleet-driver-sessions/POST";
import migrate_form_fields_post_200 from "./api/migrate-form-fields/POST";
import migrate_form_logic_post_201 from "./api/migrate-form-logic/POST";
import migrate_form_templates_post_202 from "./api/migrate-form-templates/POST";
import migrate_job_forms_post_203 from "./api/migrate-job-forms/POST";
import migrate_job_photos_post_204 from "./api/migrate-job-photos/POST";
import migrate_job_tabs_post_205 from "./api/migrate-job-tabs/POST";
import migrate_jobs_post_206 from "./api/migrate-jobs/POST";
import migrate_notifications_post_207 from "./api/migrate-notifications/POST";
import migrate_owner_console_post_208 from "./api/migrate-owner-console/POST";
import migrate_owner_role_post_209 from "./api/migrate-owner-role/POST";
import migrate_pdf_settings_post_210 from "./api/migrate-pdf-settings/POST";
import migrate_safety_post_211 from "./api/migrate-safety/POST";
import migrate_starter_pack_post_212 from "./api/migrate-starter-pack/POST";
import migrate_subscriptions_post_213 from "./api/migrate-subscriptions/POST";
import migrate_support_mode_post_214 from "./api/migrate-support-mode/POST";
import migrate_takeoff_pad_post_215 from "./api/migrate-takeoff-pad/POST";
import migrate_team_post_216 from "./api/migrate-team/POST";
import notifications_alerts_get_217 from "./api/notifications/alerts/GET";
import notifications_prefs_get_218 from "./api/notifications/prefs/GET";
import notifications_prefs_put_219 from "./api/notifications/prefs/PUT";
import notifications_read_post_220 from "./api/notifications/read/POST";
import owner_console_activity_get_221 from "./api/owner-console/activity/GET";
import owner_console_cancellation_feedback_get_222 from "./api/owner-console/cancellation-feedback/GET";
import owner_console_companies_get_223 from "./api/owner-console/companies/GET";
import owner_console_companies_post_224 from "./api/owner-console/companies/POST";
import owner_console_companies_usage_get_225 from "./api/owner-console/companies/usage/GET";
import owner_console_companies_id_limits_put_226 from "./api/owner-console/companies/[id]/limits/PUT";
import owner_console_starter_pack_get_227 from "./api/owner-console/starter-pack/GET";
import owner_console_starter_pack_post_228 from "./api/owner-console/starter-pack/POST";
import owner_console_stats_get_229 from "./api/owner-console/stats/GET";
import owner_console_storage_get_230 from "./api/owner-console/storage/GET";
import owner_console_system_ai_builtin_checks_post_231 from "./api/owner-console/system-ai/builtin-checks/POST";
import owner_console_users_get_232 from "./api/owner-console/users/GET";
import owner_console_users_verify_post_233 from "./api/owner-console/users/verify/POST";
import recipes_get_234 from "./api/recipes/GET";
import recipes_post_235 from "./api/recipes/POST";
import recipes_id_delete_236 from "./api/recipes/[id]/DELETE";
import recipes_id_put_237 from "./api/recipes/[id]/PUT";
import safety_ai_draft_post_238 from "./api/safety/ai/draft/POST";
import safety_documents_get_239 from "./api/safety/documents/GET";
import safety_documents_post_240 from "./api/safety/documents/POST";
import safety_documents_id_delete_241 from "./api/safety/documents/[id]/DELETE";
import safety_documents_id_download_get_242 from "./api/safety/documents/[id]/download/GET";
import safety_generated_posters_get_243 from "./api/safety/generated-posters/GET";
import safety_generated_posters_post_244 from "./api/safety/generated-posters/POST";
import safety_generated_posters_id_delete_245 from "./api/safety/generated-posters/[id]/DELETE";
import safety_job_safety_plans_get_246 from "./api/safety/job-safety-plans/GET";
import safety_job_safety_plans_post_247 from "./api/safety/job-safety-plans/POST";
import safety_job_safety_plans_id_delete_248 from "./api/safety/job-safety-plans/[id]/DELETE";
import safety_job_safety_plans_id_put_249 from "./api/safety/job-safety-plans/[id]/PUT";
import safety_job_swms_get_250 from "./api/safety/job-swms/GET";
import safety_job_swms_post_251 from "./api/safety/job-swms/POST";
import safety_job_swms_id_delete_252 from "./api/safety/job-swms/[id]/DELETE";
import safety_job_swms_id_get_253 from "./api/safety/job-swms/[id]/GET";
import safety_job_swms_id_put_254 from "./api/safety/job-swms/[id]/PUT";
import safety_job_swms_id_signoffs_get_255 from "./api/safety/job-swms/[id]/signoffs/GET";
import safety_job_swms_id_signoffs_post_256 from "./api/safety/job-swms/[id]/signoffs/POST";
import safety_job_swms_id_signoffs_signoffId_delete_257 from "./api/safety/job-swms/[id]/signoffs/[signoffId]/DELETE";
import safety_plans_get_258 from "./api/safety/plans/GET";
import safety_plans_post_259 from "./api/safety/plans/POST";
import safety_plans_seed_post_260 from "./api/safety/plans/seed/POST";
import safety_plans_id_delete_261 from "./api/safety/plans/[id]/DELETE";
import safety_plans_id_put_262 from "./api/safety/plans/[id]/PUT";
import safety_plans_id_export_get_263 from "./api/safety/plans/[id]/export/GET";
import safety_plans_id_pack_get_264 from "./api/safety/plans/[id]/pack/GET";
import safety_posters_get_265 from "./api/safety/posters/GET";
import safety_posters_post_266 from "./api/safety/posters/POST";
import safety_posters_id_delete_267 from "./api/safety/posters/[id]/DELETE";
import safety_swms_get_268 from "./api/safety/swms/GET";
import safety_swms_post_269 from "./api/safety/swms/POST";
import safety_swms_seed_post_270 from "./api/safety/swms/seed/POST";
import safety_swms_id_delete_271 from "./api/safety/swms/[id]/DELETE";
import safety_swms_id_get_272 from "./api/safety/swms/[id]/GET";
import safety_swms_id_put_273 from "./api/safety/swms/[id]/PUT";
import safety_swms_id_duplicate_post_274 from "./api/safety/swms/[id]/duplicate/POST";
import safety_swms_id_export_get_275 from "./api/safety/swms/[id]/export/GET";
import scheduler_jobs_get_276 from "./api/scheduler/jobs/GET";
import secure_share_get_277 from "./api/secure-share/GET";
import secure_share_post_278 from "./api/secure-share/POST";
import secure_share_id_delete_279 from "./api/secure-share/[id]/DELETE";
import secure_share_token_get_280 from "./api/secure-share/[token]/GET";
import secure_share_token_post_281 from "./api/secure-share/[token]/POST";
import settings_backup_get_282 from "./api/settings/backup/GET";
import settings_backup_post_283 from "./api/settings/backup/POST";
import settings_backup_export_get_284 from "./api/settings/backup/export/GET";
import settings_backup_run_post_285 from "./api/settings/backup/run/POST";
import settings_backup_destination_get_286 from "./api/settings/backup-destination/GET";
import settings_backup_destination_post_287 from "./api/settings/backup-destination/POST";
import settings_dazza_ai_key_get_288 from "./api/settings/dazza-ai-key/GET";
import settings_dazza_ai_key_post_289 from "./api/settings/dazza-ai-key/POST";
import settings_file_transfer_backup_get_290 from "./api/settings/file-transfer-backup/GET";
import settings_file_transfer_backup_post_291 from "./api/settings/file-transfer-backup/POST";
import settings_retention_get_292 from "./api/settings/retention/GET";
import settings_retention_post_293 from "./api/settings/retention/POST";
import settings_storage_provider_get_294 from "./api/settings/storage-provider/GET";
import settings_storage_provider_debug_get_295 from "./api/settings/storage-provider/debug/GET";
import settings_storage_provider_test_post_296 from "./api/settings/storage-provider/test/POST";
import settings_terminology_get_297 from "./api/settings/terminology/GET";
import settings_terminology_post_298 from "./api/settings/terminology/POST";
import settings_xero_credentials_get_299 from "./api/settings/xero-credentials/GET";
import settings_xero_credentials_post_300 from "./api/settings/xero-credentials/POST";
import share_token_get_301 from "./api/share/[token]/GET";
import signup_post_302 from "./api/signup/POST";
import stripe_create_checkout_session_post_303 from "./api/stripe/create-checkout-session/POST";
import stripe_session_sessionId_get_304 from "./api/stripe/session/[sessionId]/GET";
import subscription_create_checkout_post_305 from "./api/subscription/create-checkout/POST";
import subscription_status_get_306 from "./api/subscription/status/GET";
import subscription_webhook_post_307 from "./api/subscription/webhook/POST";
import support_mode_audit_get_308 from "./api/support-mode/audit/GET";
import support_mode_checklist_get_309 from "./api/support-mode/checklist/GET";
import support_mode_checklist_put_310 from "./api/support-mode/checklist/PUT";
import support_mode_enter_post_311 from "./api/support-mode/enter/POST";
import support_mode_exit_post_312 from "./api/support-mode/exit/POST";
import support_mode_status_get_313 from "./api/support-mode/status/GET";
import takeoff_pad_get_314 from "./api/takeoff-pad/GET";
import takeoff_pad_put_315 from "./api/takeoff-pad/PUT";
import team_get_316 from "./api/team/GET";
import team_invite_post_317 from "./api/team/invite/POST";
import team_members_get_318 from "./api/team/members/GET";
import team_resend_verification_post_319 from "./api/team/resend-verification/POST";
import team_verify_user_post_320 from "./api/team/verify-user/POST";
import team_id_delete_321 from "./api/team/[id]/DELETE";
import team_id_put_322 from "./api/team/[id]/PUT";
import usage_get_323 from "./api/usage/GET";
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
  // Prevent clickjacking
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
  // Prevent cross-origin window attacks
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  // Prevent cross-origin resource embedding
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  // Complete the COOP/COEP pair — required for SharedArrayBuffer and high-res timers
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  // CSP — same-origin + trusted third parties only
  // connect-src includes R2 public URL if configured
  const r2PublicUrl = process.env.R2_PUBLIC_URL ? process.env.R2_PUBLIC_URL.replace(/\/$/, '') : null;
  const connectSrc = [
    "'self'",
    'https://api.stripe.com',
    'https://login.xero.com',
    'https://api.xero.com',
    ...(r2PublicUrl ? [r2PublicUrl] : []),
  ].join(' ');
  // In production: drop unsafe-eval (only needed by Vite HMR in dev).
  // In dev: keep it so the Vite client and React refresh work correctly.
  const scriptSrc = import.meta.env.PROD
    ? `script-src 'self' 'unsafe-inline' https://js.stripe.com`
    : `script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com`;
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
    // ── Xero — per-company credentials stored in UI (owner sets via Settings → Accounting) ──
    { table: 'company_settings', column: 'xero_client_id',      definition: 'TEXT NULL' },
    { table: 'company_settings', column: 'xero_client_secret',  definition: 'TEXT NULL' },
    { table: 'company_settings', column: 'xero_redirect_uri',   definition: 'TEXT NULL' },
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
    'daryl.williams1581@gmail.com',
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
app.post("/api/active-ping", active_ping_post_0);
app.post("/api/auth/change-email", auth_change_email_post_1);
app.post("/api/auth/forgot-password", auth_forgot_password_post_2);
app.post("/api/auth/pin-login", auth_pin_login_post_3);
app.post("/api/auth/resend-verification", auth_resend_verification_post_4);
app.post("/api/auth/reset-password", auth_reset_password_post_5);
app.post("/api/auth/self-verify", auth_self_verify_post_6);
app.post("/api/auth/send-sms-code", auth_send_sms_code_post_7);
app.get("/api/auth/sms-configured", auth_sms_configured_get_8);
app.post("/api/auth/sms-recovery", auth_sms_recovery_post_9);
app.get("/api/auth/trusted-devices", auth_trusted_devices_get_10);
app.post("/api/auth/trusted-devices", auth_trusted_devices_post_11);
app.delete("/api/auth/trusted-devices/:deviceId", auth_trusted_devices_deviceId_delete_12);
app.get("/api/auth/validate-reset-token", auth_validate_reset_token_get_13);
app.post("/api/auth/verify-email", auth_verify_email_post_14);
app.post("/api/auth/verify-sms-code", auth_verify_sms_code_post_15);
app.get("/api/auth/:action", auth_action_get_16);
app.post("/api/auth/:action", auth_action_post_17);
app.get("/api/auth/:action/:detail", auth_action_detail_get_18);
app.post("/api/auth/:action/:detail", auth_action_detail_post_19);
app.post("/api/billing/cancel-subscription", billing_cancel_subscription_post_20);
app.post("/api/billing/cancellation-feedback", billing_cancellation_feedback_post_21);
app.post("/api/billing/customer-portal", billing_customer_portal_post_22);
app.post("/api/billing/reactivate-subscription", billing_reactivate_subscription_post_23);
app.post("/api/billing/upgrade-subscription", billing_upgrade_subscription_post_24);
app.get("/api/company", company_get_25);
app.put("/api/company", company_put_26);
app.get("/api/company-settings", company_settings_get_27);
app.put("/api/company-settings", company_settings_put_28);
app.post("/api/contact", contact_post_29);
app.get("/api/cost-guide", cost_guide_get_30);
app.post("/api/cost-guide", cost_guide_post_31);
app.get("/api/cost-guide/export-csv", cost_guide_export_csv_get_32);
app.post("/api/cost-guide/import-csv", cost_guide_import_csv_post_33);
app.delete("/api/cost-guide/:id", cost_guide_id_delete_34);
app.put("/api/cost-guide/:id", cost_guide_id_put_35);
app.get("/api/customers", customers_get_36);
app.post("/api/customers", customers_post_37);
app.delete("/api/customers/:id", customers_id_delete_38);
app.get("/api/customers/:id", customers_id_get_39);
app.put("/api/customers/:id", customers_id_put_40);
app.get("/api/dashboard/setup-check", dashboard_setup_check_get_41);
app.get("/api/dashboard/todos", dashboard_todos_get_42);
app.post("/api/dazza/annette", dazza_annette_post_43);
app.post("/api/dazza/brain/hive/approve", dazza_brain_hive_approve_post_44);
app.post("/api/dazza/brain/hive/reject", dazza_brain_hive_reject_post_45);
app.get("/api/dazza/brain/status", dazza_brain_status_get_46);
app.post("/api/dazza/chat", dazza_chat_post_47);
app.get("/api/dazza/context", dazza_context_get_48);
app.get("/api/dazza/key-status", dazza_key_status_get_49);
app.get("/api/dazza/knowledge", dazza_knowledge_get_50);
app.post("/api/dazza/knowledge", dazza_knowledge_post_51);
app.delete("/api/dazza/knowledge/:id", dazza_knowledge_id_delete_52);
app.put("/api/dazza/knowledge/:id", dazza_knowledge_id_put_53);
app.get("/api/documents", documents_get_54);
app.get("/api/documents/share/:token", documents_share_token_get_55);
app.post("/api/documents/share/:token", documents_share_token_post_56);
app.get("/api/documents/:id", documents_id_get_57);
app.put("/api/documents/:id", documents_id_put_58);
app.get("/api/documents/:id/events", documents_id_events_get_59);
app.delete("/api/documents/:id/share", documents_id_share_delete_60);
app.post("/api/documents/:id/share", documents_id_share_post_61);
app.get("/api/drawings", drawings_get_62);
app.post("/api/drawings", drawings_post_63);
app.post("/api/drawings/upload", drawings_upload_post_64);
app.delete("/api/drawings/:id", drawings_id_delete_65);
app.patch("/api/drawings/:id", drawings_id_patch_66);
app.post("/api/drawings/:id/markup", drawings_id_markup_post_67);
app.get("/api/estimates", estimates_get_68);
app.post("/api/estimates", estimates_post_69);
app.delete("/api/estimates/:id", estimates_id_delete_70);
app.get("/api/estimates/:id", estimates_id_get_71);
app.put("/api/estimates/:id", estimates_id_put_72);
app.get("/api/estimates/:id/export-csv", estimates_id_export_csv_get_73);
app.post("/api/estimates/:id/import-csv", estimates_id_import_csv_post_74);
app.get("/api/external/form/:token", external_form_token_get_75);
app.post("/api/external/form/:token", external_form_token_post_76);
app.get("/api/files", files_get_77);
app.post("/api/files", files_post_78);
app.delete("/api/files/:id", files_id_delete_79);
app.get("/api/files/:id/download", files_id_download_get_80);
app.get("/api/fleet", fleet_get_81);
app.post("/api/fleet", fleet_post_82);
app.post("/api/fleet/driver-sessions", fleet_driver_sessions_post_83);
app.get("/api/fleet/driver-sessions/active", fleet_driver_sessions_active_get_84);
app.post("/api/fleet/driver-sessions/:id/stop", fleet_driver_sessions_id_stop_post_85);
app.get("/api/fleet/flags", fleet_flags_get_86);
app.get("/api/fleet/vehicles", fleet_vehicles_get_87);
app.get("/api/fleet/:id", fleet_id_get_88);
app.put("/api/fleet/:id", fleet_id_put_89);
app.get("/api/fleet/:id/driver-sessions", fleet_id_driver_sessions_get_90);
app.get("/api/fleet/:id/files", fleet_id_files_get_91);
app.get("/api/fleet/:id/prestarts", fleet_id_prestarts_get_92);
app.post("/api/fleet/:id/prestarts", fleet_id_prestarts_post_93);
app.get("/api/form-templates", form_templates_get_94);
app.post("/api/form-templates", form_templates_post_95);
app.post("/api/form-templates/seed", form_templates_seed_post_96);
app.delete("/api/form-templates/:id", form_templates_id_delete_97);
app.put("/api/form-templates/:id", form_templates_id_put_98);
app.get("/api/forms/:id/fields", forms_id_fields_get_99);
app.post("/api/forms/:id/fields", forms_id_fields_post_100);
app.post("/api/forms/:id/fields/reorder", forms_id_fields_reorder_post_101);
app.delete("/api/forms/:id/fields/:fieldId", forms_id_fields_fieldId_delete_102);
app.patch("/api/forms/:id/fields/:fieldId", forms_id_fields_fieldId_patch_103);
app.post("/api/forms/:id/fields/:fieldId/thumbnail", forms_id_fields_fieldId_thumbnail_post_104);
app.get("/api/health", health_get_105);
app.get("/api/integrations/onedrive/auth-url", integrations_onedrive_auth_url_get_106);
app.get("/api/integrations/onedrive/callback", integrations_onedrive_callback_get_107);
app.post("/api/integrations/onedrive/disconnect", integrations_onedrive_disconnect_post_108);
app.get("/api/integrations/onedrive/status", integrations_onedrive_status_get_109);
app.post("/api/integrations/onedrive/upload-file", integrations_onedrive_upload_file_post_110);
app.get("/api/integrations/xero/auth-url", integrations_xero_auth_url_get_111);
app.get("/api/integrations/xero/callback", integrations_xero_callback_get_112);
app.post("/api/integrations/xero/disconnect", integrations_xero_disconnect_post_113);
app.get("/api/integrations/xero/status", integrations_xero_status_get_114);
app.post("/api/integrations/xero/sync-customer", integrations_xero_sync_customer_post_115);
app.post("/api/integrations/xero/sync-invoice", integrations_xero_sync_invoice_post_116);
app.post("/api/integrations/xero/webhook", integrations_xero_webhook_post_117);
app.get("/api/invoices", invoices_get_118);
app.post("/api/invoices", invoices_post_119);
app.delete("/api/invoices/:id", invoices_id_delete_120);
app.get("/api/invoices/:id", invoices_id_get_121);
app.put("/api/invoices/:id", invoices_id_put_122);
app.post("/api/invoices/:id/duplicate", invoices_id_duplicate_post_123);
app.post("/api/invoices/:id/mark-sent", invoices_id_mark_sent_post_124);
app.post("/api/invoices/:id/record-payment", invoices_id_record_payment_post_125);
app.post("/api/invoices/:id/void", invoices_id_void_post_126);
app.delete("/api/job-forms/:id", job_forms_id_delete_127);
app.get("/api/job-forms/:id", job_forms_id_get_128);
app.put("/api/job-forms/:id", job_forms_id_put_129);
app.post("/api/job-forms/:id/reset", job_forms_id_reset_post_130);
app.delete("/api/job-forms/:id/share", job_forms_id_share_delete_131);
app.get("/api/job-forms/:id/share", job_forms_id_share_get_132);
app.post("/api/job-forms/:id/share", job_forms_id_share_post_133);
app.get("/api/jobs", jobs_get_134);
app.post("/api/jobs", jobs_post_135);
app.get("/api/jobs/:id", jobs_id_get_136);
app.put("/api/jobs/:id", jobs_id_put_137);
app.get("/api/jobs/:id/costs", jobs_id_costs_get_138);
app.post("/api/jobs/:id/costs", jobs_id_costs_post_139);
app.get("/api/jobs/:id/costs/export", jobs_id_costs_export_get_140);
app.delete("/api/jobs/:id/costs/:costId", jobs_id_costs_costId_delete_141);
app.put("/api/jobs/:id/costs/:costId", jobs_id_costs_costId_put_142);
app.get("/api/jobs/:id/costs/:costId/receipt", jobs_id_costs_costId_receipt_get_143);
app.post("/api/jobs/:id/costs/:costId/receipt", jobs_id_costs_costId_receipt_post_144);
app.get("/api/jobs/:id/delays", jobs_id_delays_get_145);
app.post("/api/jobs/:id/delays", jobs_id_delays_post_146);
app.delete("/api/jobs/:id/delays/:delayId", jobs_id_delays_delayId_delete_147);
app.put("/api/jobs/:id/delays/:delayId", jobs_id_delays_delayId_put_148);
app.get("/api/jobs/:id/files", jobs_id_files_get_149);
app.get("/api/jobs/:id/forms", jobs_id_forms_get_150);
app.post("/api/jobs/:id/forms", jobs_id_forms_post_151);
app.get("/api/jobs/:id/ledger", jobs_id_ledger_get_152);
app.post("/api/jobs/:id/ledger", jobs_id_ledger_post_153);
app.get("/api/jobs/:id/ledger/export", jobs_id_ledger_export_get_154);
app.post("/api/jobs/:id/ledger/sync", jobs_id_ledger_sync_post_155);
app.delete("/api/jobs/:id/ledger/:entryId", jobs_id_ledger_entryId_delete_156);
app.put("/api/jobs/:id/ledger/:entryId", jobs_id_ledger_entryId_put_157);
app.get("/api/jobs/:id/photos", jobs_id_photos_get_158);
app.post("/api/jobs/:id/photos", jobs_id_photos_post_159);
app.delete("/api/jobs/:id/photos/:photoId", jobs_id_photos_photoId_delete_160);
app.patch("/api/jobs/:id/photos/:photoId", jobs_id_photos_photoId_patch_161);
app.get("/api/jobs/:id/photos/:photoId/download", jobs_id_photos_photoId_download_get_162);
app.post("/api/jobs/:id/photos/:photoId/replace", jobs_id_photos_photoId_replace_post_163);
app.get("/api/jobs/:id/progress", jobs_id_progress_get_164);
app.put("/api/jobs/:id/progress", jobs_id_progress_put_165);
app.post("/api/jobs/:id/progress/sync", jobs_id_progress_sync_post_166);
app.get("/api/jobs/:id/purchase-orders", jobs_id_purchase_orders_get_167);
app.post("/api/jobs/:id/purchase-orders", jobs_id_purchase_orders_post_168);
app.delete("/api/jobs/:id/purchase-orders/:poId", jobs_id_purchase_orders_poId_delete_169);
app.get("/api/jobs/:id/purchase-orders/:poId", jobs_id_purchase_orders_poId_get_170);
app.put("/api/jobs/:id/purchase-orders/:poId", jobs_id_purchase_orders_poId_put_171);
app.get("/api/jobs/:id/purchase-orders/:poId/pdf", jobs_id_purchase_orders_poId_pdf_get_172);
app.get("/api/jobs/:id/swms", jobs_id_swms_get_173);
app.post("/api/jobs/:id/swms", jobs_id_swms_post_174);
app.post("/api/jobs/:id/swms/:swmsId/signoff", jobs_id_swms_swmsId_signoff_post_175);
app.get("/api/jobs/:id/todos", jobs_id_todos_get_176);
app.post("/api/jobs/:id/todos", jobs_id_todos_post_177);
app.delete("/api/jobs/:id/todos/:todoId", jobs_id_todos_todoId_delete_178);
app.put("/api/jobs/:id/todos/:todoId", jobs_id_todos_todoId_put_179);
app.get("/api/me", me_get_180);
app.put("/api/me", me_put_181);
app.post("/api/me/2fa/disable", me_2fa_disable_post_182);
app.post("/api/me/2fa/enable", me_2fa_enable_post_183);
app.get("/api/me/2fa/setup", me_2fa_setup_get_184);
app.get("/api/me/2fa/status", me_2fa_status_get_185);
app.post("/api/me/2fa/verify", me_2fa_verify_post_186);
app.post("/api/me/change-password", me_change_password_post_187);
app.get("/api/me/email-status", me_email_status_get_188);
app.get("/api/me/phone", me_phone_get_189);
app.put("/api/me/phone", me_phone_put_190);
app.post("/api/migrate-account-recovery", migrate_account_recovery_post_191);
app.post("/api/migrate-company-settings", migrate_company_settings_post_192);
app.post("/api/migrate-dazza-audit", migrate_dazza_audit_post_193);
app.post("/api/migrate-dazza-knowledge", migrate_dazza_knowledge_post_194);
app.post("/api/migrate-estimates", migrate_estimates_post_195);
app.post("/api/migrate-estimating-library", migrate_estimating_library_post_196);
app.post("/api/migrate-files", migrate_files_post_197);
app.post("/api/migrate-fleet", migrate_fleet_post_198);
app.post("/api/migrate-fleet-driver-sessions", migrate_fleet_driver_sessions_post_199);
app.post("/api/migrate-form-fields", migrate_form_fields_post_200);
app.post("/api/migrate-form-logic", migrate_form_logic_post_201);
app.post("/api/migrate-form-templates", migrate_form_templates_post_202);
app.post("/api/migrate-job-forms", migrate_job_forms_post_203);
app.post("/api/migrate-job-photos", migrate_job_photos_post_204);
app.post("/api/migrate-job-tabs", migrate_job_tabs_post_205);
app.post("/api/migrate-jobs", migrate_jobs_post_206);
app.post("/api/migrate-notifications", migrate_notifications_post_207);
app.post("/api/migrate-owner-console", migrate_owner_console_post_208);
app.post("/api/migrate-owner-role", migrate_owner_role_post_209);
app.post("/api/migrate-pdf-settings", migrate_pdf_settings_post_210);
app.post("/api/migrate-safety", migrate_safety_post_211);
app.post("/api/migrate-starter-pack", migrate_starter_pack_post_212);
app.post("/api/migrate-subscriptions", migrate_subscriptions_post_213);
app.post("/api/migrate-support-mode", migrate_support_mode_post_214);
app.post("/api/migrate-takeoff-pad", migrate_takeoff_pad_post_215);
app.post("/api/migrate-team", migrate_team_post_216);
app.get("/api/notifications/alerts", notifications_alerts_get_217);
app.get("/api/notifications/prefs", notifications_prefs_get_218);
app.put("/api/notifications/prefs", notifications_prefs_put_219);
app.post("/api/notifications/read", notifications_read_post_220);
app.get("/api/owner-console/activity", requirePlatformOwner, owner_console_activity_get_221);
app.get("/api/owner-console/cancellation-feedback", requirePlatformOwner, owner_console_cancellation_feedback_get_222);
app.get("/api/owner-console/companies", requirePlatformOwner, owner_console_companies_get_223);
app.post("/api/owner-console/companies", requirePlatformOwner, owner_console_companies_post_224);
app.get("/api/owner-console/companies/usage", requirePlatformOwner, owner_console_companies_usage_get_225);
app.put("/api/owner-console/companies/:id/limits", requirePlatformOwner, owner_console_companies_id_limits_put_226);
app.get("/api/owner-console/starter-pack", requirePlatformOwner, owner_console_starter_pack_get_227);
app.post("/api/owner-console/starter-pack", requirePlatformOwner, owner_console_starter_pack_post_228);
app.get("/api/owner-console/stats", requirePlatformOwner, owner_console_stats_get_229);
app.get("/api/owner-console/storage", requirePlatformOwner, owner_console_storage_get_230);
app.post("/api/owner-console/system-ai/builtin-checks", requirePlatformOwner, owner_console_system_ai_builtin_checks_post_231);
app.get("/api/owner-console/users", requirePlatformOwner, owner_console_users_get_232);
app.post("/api/owner-console/users/verify", requirePlatformOwner, owner_console_users_verify_post_233);
app.get("/api/recipes", recipes_get_234);
app.post("/api/recipes", recipes_post_235);
app.delete("/api/recipes/:id", recipes_id_delete_236);
app.put("/api/recipes/:id", recipes_id_put_237);
app.post("/api/safety/ai/draft", safety_ai_draft_post_238);
app.get("/api/safety/documents", safety_documents_get_239);
app.post("/api/safety/documents", safety_documents_post_240);
app.delete("/api/safety/documents/:id", safety_documents_id_delete_241);
app.get("/api/safety/documents/:id/download", safety_documents_id_download_get_242);
app.get("/api/safety/generated-posters", safety_generated_posters_get_243);
app.post("/api/safety/generated-posters", safety_generated_posters_post_244);
app.delete("/api/safety/generated-posters/:id", safety_generated_posters_id_delete_245);
app.get("/api/safety/job-safety-plans", safety_job_safety_plans_get_246);
app.post("/api/safety/job-safety-plans", safety_job_safety_plans_post_247);
app.delete("/api/safety/job-safety-plans/:id", safety_job_safety_plans_id_delete_248);
app.put("/api/safety/job-safety-plans/:id", safety_job_safety_plans_id_put_249);
app.get("/api/safety/job-swms", safety_job_swms_get_250);
app.post("/api/safety/job-swms", safety_job_swms_post_251);
app.delete("/api/safety/job-swms/:id", safety_job_swms_id_delete_252);
app.get("/api/safety/job-swms/:id", safety_job_swms_id_get_253);
app.put("/api/safety/job-swms/:id", safety_job_swms_id_put_254);
app.get("/api/safety/job-swms/:id/signoffs", safety_job_swms_id_signoffs_get_255);
app.post("/api/safety/job-swms/:id/signoffs", safety_job_swms_id_signoffs_post_256);
app.delete("/api/safety/job-swms/:id/signoffs/:signoffId", safety_job_swms_id_signoffs_signoffId_delete_257);
app.get("/api/safety/plans", safety_plans_get_258);
app.post("/api/safety/plans", safety_plans_post_259);
app.post("/api/safety/plans/seed", safety_plans_seed_post_260);
app.delete("/api/safety/plans/:id", safety_plans_id_delete_261);
app.put("/api/safety/plans/:id", safety_plans_id_put_262);
app.get("/api/safety/plans/:id/export", safety_plans_id_export_get_263);
app.get("/api/safety/plans/:id/pack", safety_plans_id_pack_get_264);
app.get("/api/safety/posters", safety_posters_get_265);
app.post("/api/safety/posters", safety_posters_post_266);
app.delete("/api/safety/posters/:id", safety_posters_id_delete_267);
app.get("/api/safety/swms", safety_swms_get_268);
app.post("/api/safety/swms", safety_swms_post_269);
app.post("/api/safety/swms/seed", safety_swms_seed_post_270);
app.delete("/api/safety/swms/:id", safety_swms_id_delete_271);
app.get("/api/safety/swms/:id", safety_swms_id_get_272);
app.put("/api/safety/swms/:id", safety_swms_id_put_273);
app.post("/api/safety/swms/:id/duplicate", safety_swms_id_duplicate_post_274);
app.get("/api/safety/swms/:id/export", safety_swms_id_export_get_275);
app.get("/api/scheduler/jobs", scheduler_jobs_get_276);
app.get("/api/secure-share", secure_share_get_277);
app.post("/api/secure-share", secure_share_post_278);
app.delete("/api/secure-share/:id", secure_share_id_delete_279);
app.get("/api/secure-share/:token", secure_share_token_get_280);
app.post("/api/secure-share/:token", secure_share_token_post_281);
app.get("/api/settings/backup", settings_backup_get_282);
app.post("/api/settings/backup", settings_backup_post_283);
app.get("/api/settings/backup/export", settings_backup_export_get_284);
app.post("/api/settings/backup/run", settings_backup_run_post_285);
app.get("/api/settings/backup-destination", settings_backup_destination_get_286);
app.post("/api/settings/backup-destination", settings_backup_destination_post_287);
app.get("/api/settings/dazza-ai-key", settings_dazza_ai_key_get_288);
app.post("/api/settings/dazza-ai-key", settings_dazza_ai_key_post_289);
app.get("/api/settings/file-transfer-backup", settings_file_transfer_backup_get_290);
app.post("/api/settings/file-transfer-backup", settings_file_transfer_backup_post_291);
app.get("/api/settings/retention", settings_retention_get_292);
app.post("/api/settings/retention", settings_retention_post_293);
app.get("/api/settings/storage-provider", settings_storage_provider_get_294);
app.get("/api/settings/storage-provider/debug", settings_storage_provider_debug_get_295);
app.post("/api/settings/storage-provider/test", settings_storage_provider_test_post_296);
app.get("/api/settings/terminology", settings_terminology_get_297);
app.post("/api/settings/terminology", settings_terminology_post_298);
app.get("/api/settings/xero-credentials", settings_xero_credentials_get_299);
app.post("/api/settings/xero-credentials", settings_xero_credentials_post_300);
app.get("/api/share/:token", share_token_get_301);
app.post("/api/signup", signup_post_302);
app.post("/api/stripe/create-checkout-session", stripe_create_checkout_session_post_303);
app.get("/api/stripe/session/:sessionId", stripe_session_sessionId_get_304);
app.post("/api/subscription/create-checkout", subscription_create_checkout_post_305);
app.get("/api/subscription/status", subscription_status_get_306);
app.post("/api/subscription/webhook", subscription_webhook_post_307);
app.get("/api/support-mode/audit", support_mode_audit_get_308);
app.get("/api/support-mode/checklist", support_mode_checklist_get_309);
app.put("/api/support-mode/checklist", support_mode_checklist_put_310);
app.post("/api/support-mode/enter", support_mode_enter_post_311);
app.post("/api/support-mode/exit", support_mode_exit_post_312);
app.get("/api/support-mode/status", support_mode_status_get_313);
app.get("/api/takeoff-pad", takeoff_pad_get_314);
app.put("/api/takeoff-pad", takeoff_pad_put_315);
app.get("/api/team", team_get_316);
app.post("/api/team/invite", team_invite_post_317);
app.get("/api/team/members", team_members_get_318);
app.post("/api/team/resend-verification", team_resend_verification_post_319);
app.post("/api/team/verify-user", team_verify_user_post_320);
app.delete("/api/team/:id", team_id_delete_321);
app.put("/api/team/:id", team_id_put_322);
app.get("/api/usage", usage_get_323);
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
				// MySQL 8 ALTER TABLE ADD COLUMN IF NOT EXISTS is supported in 8.0.3+
				// Use separate statements to avoid partial failure
				await _db.execute(_sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS starter_pack_loaded TINYINT(1) NOT NULL DEFAULT 0`);
				await _db.execute(_sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS starter_pack_loaded_at TIMESTAMP NULL`);
				console.log('[startup] companies.starter_pack_loaded columns ready');
			} catch (e) {
				const msg = (e as Error)?.message ?? '';
				if (!msg.includes('Duplicate column') && !msg.includes('already exists')) {
					console.warn('[startup] companies starter_pack columns migration skipped:', msg.slice(0, 120));
				}
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
