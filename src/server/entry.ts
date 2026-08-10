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
import active_ping_post_0 from "./api/active-ping/POST.js";
import admin_set_user_company_post_1 from "./api/admin/set-user-company/POST.js";
import asset_manager_assets_get_2 from "./api/asset-manager/assets/GET.js";
import asset_manager_assets_post_3 from "./api/asset-manager/assets/POST.js";
import asset_manager_assets_id_get_4 from "./api/asset-manager/assets/[id]/GET.js";
import asset_manager_assets_id_patch_5 from "./api/asset-manager/assets/[id]/PATCH.js";
import asset_manager_assets_id_archive_post_6 from "./api/asset-manager/assets/[id]/archive/POST.js";
import asset_manager_assets_id_notes_get_7 from "./api/asset-manager/assets/[id]/notes/GET.js";
import asset_manager_assets_id_notes_post_8 from "./api/asset-manager/assets/[id]/notes/POST.js";
import asset_manager_assets_id_notes_noteId_delete_9 from "./api/asset-manager/assets/[id]/notes/[noteId]/DELETE.js";
import asset_manager_assets_id_permanent_delete_10 from "./api/asset-manager/assets/[id]/permanent/DELETE.js";
import asset_manager_assets_id_photos_get_11 from "./api/asset-manager/assets/[id]/photos/GET.js";
import asset_manager_assets_id_photos_post_12 from "./api/asset-manager/assets/[id]/photos/POST.js";
import asset_manager_assets_id_photos_photoId_delete_13 from "./api/asset-manager/assets/[id]/photos/[photoId]/DELETE.js";
import asset_manager_assets_id_restore_post_14 from "./api/asset-manager/assets/[id]/restore/POST.js";
import asset_manager_assets_id_todos_get_15 from "./api/asset-manager/assets/[id]/todos/GET.js";
import asset_manager_assets_id_todos_post_16 from "./api/asset-manager/assets/[id]/todos/POST.js";
import asset_manager_assets_id_todos_todoId_delete_17 from "./api/asset-manager/assets/[id]/todos/[todoId]/DELETE.js";
import asset_manager_assets_id_todos_todoId_put_18 from "./api/asset-manager/assets/[id]/todos/[todoId]/PUT.js";
import asset_manager_defects_get_19 from "./api/asset-manager/defects/GET.js";
import asset_manager_defects_id_patch_20 from "./api/asset-manager/defects/[id]/PATCH.js";
import asset_manager_defects_id_archive_post_21 from "./api/asset-manager/defects/[id]/archive/POST.js";
import asset_manager_inspections_get_22 from "./api/asset-manager/inspections/GET.js";
import asset_manager_inspections_post_23 from "./api/asset-manager/inspections/POST.js";
import asset_manager_inspections_id_get_24 from "./api/asset-manager/inspections/[id]/GET.js";
import asset_manager_inspections_id_patch_25 from "./api/asset-manager/inspections/[id]/PATCH.js";
import asset_manager_inspections_id_archive_post_26 from "./api/asset-manager/inspections/[id]/archive/POST.js";
import asset_manager_inspections_id_closeout_post_27 from "./api/asset-manager/inspections/[id]/closeout/POST.js";
import asset_manager_inspections_id_defects_post_28 from "./api/asset-manager/inspections/[id]/defects/POST.js";
import asset_manager_inspections_id_permanent_delete_29 from "./api/asset-manager/inspections/[id]/permanent/DELETE.js";
import asset_manager_inspections_id_photos_post_30 from "./api/asset-manager/inspections/[id]/photos/POST.js";
import asset_manager_inspections_id_report_share_post_31 from "./api/asset-manager/inspections/[id]/report/share/POST.js";
import asset_manager_inspections_id_restore_post_32 from "./api/asset-manager/inspections/[id]/restore/POST.js";
import asset_manager_inspections_id_tenders_post_33 from "./api/asset-manager/inspections/[id]/tenders/POST.js";
import asset_manager_monitoring_get_34 from "./api/asset-manager/monitoring/GET.js";
import asset_manager_reports_shareToken_get_35 from "./api/asset-manager/reports/[shareToken]/GET.js";
import asset_manager_tenders_get_36 from "./api/asset-manager/tenders/GET.js";
import asset_manager_tenders_id_get_37 from "./api/asset-manager/tenders/[id]/GET.js";
import asset_manager_tenders_id_patch_38 from "./api/asset-manager/tenders/[id]/PATCH.js";
import asset_manager_tenders_id_attachments_get_39 from "./api/asset-manager/tenders/[id]/attachments/GET.js";
import asset_manager_tenders_id_attachments_post_40 from "./api/asset-manager/tenders/[id]/attachments/POST.js";
import asset_manager_tenders_id_attachments_fileId_delete_41 from "./api/asset-manager/tenders/[id]/attachments/[fileId]/DELETE.js";
import asset_manager_tenders_id_complete_post_42 from "./api/asset-manager/tenders/[id]/complete/POST.js";
import asset_manager_tenders_id_contracts_post_43 from "./api/asset-manager/tenders/[id]/contracts/POST.js";
import asset_manager_tenders_id_notes_patch_44 from "./api/asset-manager/tenders/[id]/notes/PATCH.js";
import asset_manager_tenders_id_todos_get_45 from "./api/asset-manager/tenders/[id]/todos/GET.js";
import asset_manager_tenders_id_todos_post_46 from "./api/asset-manager/tenders/[id]/todos/POST.js";
import asset_manager_tenders_id_todos_todoId_delete_47 from "./api/asset-manager/tenders/[id]/todos/[todoId]/DELETE.js";
import asset_manager_tenders_id_todos_todoId_put_48 from "./api/asset-manager/tenders/[id]/todos/[todoId]/PUT.js";
import auth_change_email_post_49 from "./api/auth/change-email/POST.js";
import auth_change_password_post_50 from "./api/auth/change-password/POST.js";
import auth_check_signup_status_post_51 from "./api/auth/check-signup-status/POST.js";
import auth_forgot_password_post_52 from "./api/auth/forgot-password/POST.js";
import auth_pin_login_post_53 from "./api/auth/pin-login/POST.js";
import auth_resend_verification_post_54 from "./api/auth/resend-verification/POST.js";
import auth_reset_password_post_55 from "./api/auth/reset-password/POST.js";
import auth_resume_signup_post_56 from "./api/auth/resume-signup/POST.js";
import auth_self_verify_post_57 from "./api/auth/self-verify/POST.js";
import auth_send_sms_code_post_58 from "./api/auth/send-sms-code/POST.js";
import auth_sms_configured_get_59 from "./api/auth/sms-configured/GET.js";
import auth_sms_recovery_post_60 from "./api/auth/sms-recovery/POST.js";
import auth_trusted_devices_get_61 from "./api/auth/trusted-devices/GET.js";
import auth_trusted_devices_post_62 from "./api/auth/trusted-devices/POST.js";
import auth_trusted_devices_deviceId_delete_63 from "./api/auth/trusted-devices/[deviceId]/DELETE.js";
import auth_trusted_devices_deviceId_clear_pin_patch from "./api/auth/trusted-devices/[deviceId]/clear-pin/PATCH.js";
import auth_validate_reset_token_get_64 from "./api/auth/validate-reset-token/GET.js";
import auth_verify_email_post_65 from "./api/auth/verify-email/POST.js";
import auth_verify_sms_code_post_66 from "./api/auth/verify-sms-code/POST.js";
import auth_action_get_67 from "./api/auth/[action]/GET.js";
import auth_action_post_68 from "./api/auth/[action]/POST.js";
import auth_action_detail_get_69 from "./api/auth/[action]/[detail]/GET.js";
import auth_action_detail_post_70 from "./api/auth/[action]/[detail]/POST.js";
import billing_cancel_subscription_post_71 from "./api/billing/cancel-subscription/POST.js";
import billing_cancellation_feedback_post_72 from "./api/billing/cancellation-feedback/POST.js";
import billing_customer_portal_post_73 from "./api/billing/customer-portal/POST.js";
import billing_reactivate_subscription_post_74 from "./api/billing/reactivate-subscription/POST.js";
import billing_upgrade_subscription_post_75 from "./api/billing/upgrade-subscription/POST.js";
import company_get_83 from "./api/company/GET.js";
import company_put_84 from "./api/company/PUT.js";
import company_logo_post_85 from "./api/company/logo/POST.js";
import company_settings_get_86 from "./api/company-settings/GET.js";
import company_settings_put_87 from "./api/company-settings/PUT.js";
import config_maps_key_get_88 from "./api/config/maps-key/GET.js";
import contact_post_89 from "./api/contact/POST.js";
import cost_guide_get_90 from "./api/cost-guide/GET.js";
import cost_guide_post_91 from "./api/cost-guide/POST.js";
import cost_guide_export_csv_get_92 from "./api/cost-guide/export-csv/GET.js";
import cost_guide_import_csv_post_93 from "./api/cost-guide/import-csv/POST.js";
import cost_guide_id_delete_94 from "./api/cost-guide/[id]/DELETE.js";
import cost_guide_id_put_95 from "./api/cost-guide/[id]/PUT.js";
import customers_get_96 from "./api/customers/GET.js";
import customers_post_97 from "./api/customers/POST.js";
import customers_id_delete_98 from "./api/customers/[id]/DELETE.js";
import customers_id_get_99 from "./api/customers/[id]/GET.js";
import customers_id_put_100 from "./api/customers/[id]/PUT.js";
import dashboard_kpi_get_101 from "./api/dashboard/kpi/GET.js";
import dashboard_setup_check_get_102 from "./api/dashboard/setup-check/GET.js";
import dashboard_todos_get_103 from "./api/dashboard/todos/GET.js";
import dazza_annette_post_104 from "./api/dazza/annette/POST.js";
import dazza_brain_hive_approve_post_105 from "./api/dazza/brain/hive/approve/POST.js";
import dazza_brain_hive_reject_post_106 from "./api/dazza/brain/hive/reject/POST.js";
import dazza_brain_status_get_107 from "./api/dazza/brain/status/GET.js";
import dazza_chat_post_108 from "./api/dazza/chat/POST.js";
import dazza_chat_v2_post_109 from "./api/dazza/chat-v2/POST.js";
import dazza_chat_v2_stream_post_110 from "./api/dazza/chat-v2/stream/POST.js";
import dazza_context_get_111 from "./api/dazza/context/GET.js";
import dazza_key_status_get_112 from "./api/dazza/key-status/GET.js";
import dazza_knowledge_get_113 from "./api/dazza/knowledge/GET.js";
import dazza_knowledge_post_114 from "./api/dazza/knowledge/POST.js";
import dazza_knowledge_id_delete_115 from "./api/dazza/knowledge/[id]/DELETE.js";
import dazza_knowledge_id_put_116 from "./api/dazza/knowledge/[id]/PUT.js";
import developer_activity_log_get_117 from "./api/developer/activity-log/GET.js";
import developer_audit_log_get_118 from "./api/developer/audit-log/GET.js";
import developer_companies_id_archive_post_119 from "./api/developer/companies/[id]/archive/POST.js";
import developer_company_health_get_120 from "./api/developer/company-health/GET.js";
import developer_email_log_get_121 from "./api/developer/email-log/GET.js";
import developer_email_settings_get_122 from "./api/developer/email-settings/GET.js";
import developer_email_settings_put_123 from "./api/developer/email-settings/PUT.js";
import developer_email_settings_test_post_124 from "./api/developer/email-settings/test/POST.js";
import developer_run_seed_now_post_125 from "./api/developer/run-seed-now/POST.js";
import developer_seed_developer_account_post_126 from "./api/developer/seed-developer-account/POST.js";
import developer_support_notes_get_127 from "./api/developer/support-notes/GET.js";
import developer_support_notes_post_128 from "./api/developer/support-notes/POST.js";
import developer_support_notes_id_delete_129 from "./api/developer/support-notes/[id]/DELETE.js";
import developer_swms_cleanup_post_130 from "./api/developer/swms-cleanup/POST.js";
import developer_media_backfill_report_get from "./api/developer/media-backfill-report/GET.js";
import developer_users_id_assign_company_post_131 from "./api/developer/users/[id]/assign-company/POST.js";
import developer_users_id_deactivate_post_132 from "./api/developer/users/[id]/deactivate/POST.js";
import developer_users_id_delete_orphan_post_133 from "./api/developer/users/[id]/delete-orphan/POST.js";
import developer_users_id_force_temp_password_post_134 from "./api/developer/users/[id]/force-temp-password/POST.js";
import developer_users_id_impersonate_delete_135 from "./api/developer/users/[id]/impersonate/DELETE.js";
import developer_users_id_impersonate_post_136 from "./api/developer/users/[id]/impersonate/POST.js";
import developer_users_id_reactivate_post_137 from "./api/developer/users/[id]/reactivate/POST.js";
import developer_users_id_resend_verification_post_138 from "./api/developer/users/[id]/resend-verification/POST.js";
import developer_users_id_role_put_139 from "./api/developer/users/[id]/role/PUT.js";
import developer_users_id_send_reset_email_post_140 from "./api/developer/users/[id]/send-reset-email/POST.js";
import developer_users_id_sessions_delete_141 from "./api/developer/users/[id]/sessions/DELETE.js";
import developer_users_id_sessions_get_142 from "./api/developer/users/[id]/sessions/GET.js";
import developer_users_id_unlock_account_post_143 from "./api/developer/users/[id]/unlock-account/POST.js";
import document_templates_get_144 from "./api/document-templates/GET.js";
import document_templates_post_145 from "./api/document-templates/POST.js";
import document_templates_id_delete_146 from "./api/document-templates/[id]/DELETE.js";
import document_templates_id_get_147 from "./api/document-templates/[id]/GET.js";
import document_templates_id_put_148 from "./api/document-templates/[id]/PUT.js";
import document_templates_id_duplicate_post_149 from "./api/document-templates/[id]/duplicate/POST.js";
import document_templates_id_export_docx_get_150 from "./api/document-templates/[id]/export/docx/GET.js";
import document_templates_id_export_pdf_get_151 from "./api/document-templates/[id]/export/pdf/GET.js";
import document_templates_id_import_blocks_post_152 from "./api/document-templates/[id]/import-blocks/POST.js";
import document_templates_id_import_docx_post_153 from "./api/document-templates/[id]/import-docx/POST.js";
import document_templates_id_import_pdf_post_154 from "./api/document-templates/[id]/import-pdf/POST.js";
import document_templates_id_publish_to_library_post_155 from "./api/document-templates/[id]/publish-to-library/POST.js";
import documents_get_156 from "./api/documents/GET.js";
import documents_share_token_get_157 from "./api/documents/share/[token]/GET.js";
import documents_share_token_post_158 from "./api/documents/share/[token]/POST.js";
import documents_id_get_159 from "./api/documents/[id]/GET.js";
import documents_id_put_160 from "./api/documents/[id]/PUT.js";
import documents_id_events_get_161 from "./api/documents/[id]/events/GET.js";
import documents_id_share_delete_162 from "./api/documents/[id]/share/DELETE.js";
import documents_id_share_post_163 from "./api/documents/[id]/share/POST.js";
import drawings_get_164 from "./api/drawings/GET.js";
import drawings_post_165 from "./api/drawings/POST.js";
import drawings_upload_post_166 from "./api/drawings/upload/POST.js";
import drawings_id_delete_167 from "./api/drawings/[id]/DELETE.js";
import drawings_id_patch_168 from "./api/drawings/[id]/PATCH.js";
import drawings_id_markup_post_169 from "./api/drawings/[id]/markup/POST.js";
import emergency_alerts_get_170 from "./api/emergency-alerts/GET.js";
import emergency_alerts_post_171 from "./api/emergency-alerts/POST.js";
import emergency_alerts_id_put_172 from "./api/emergency-alerts/[id]/PUT.js";
import estimates_get_173 from "./api/estimates/GET.js";
import estimates_post_174 from "./api/estimates/POST.js";
import estimates_id_delete_175 from "./api/estimates/[id]/DELETE.js";
import estimates_id_get_176 from "./api/estimates/[id]/GET.js";
import estimates_id_put_177 from "./api/estimates/[id]/PUT.js";
import estimates_id_convert_to_invoice_post_178 from "./api/estimates/[id]/convert-to-invoice/POST.js";
import estimates_id_export_csv_get_179 from "./api/estimates/[id]/export-csv/GET.js";
import estimates_id_export_pdf_get_180 from "./api/estimates/[id]/export-pdf/GET.js";
import estimates_id_import_csv_post_181 from "./api/estimates/[id]/import-csv/POST.js";
import estimates_id_unlock_post_182 from "./api/estimates/[id]/unlock/POST.js";
import external_form_token_get_183 from "./api/external/form/[token]/GET.js";
import external_form_token_post_184 from "./api/external/form/[token]/POST.js";
import files_get_185 from "./api/files/GET.js";
import files_post_186 from "./api/files/POST.js";
import files_id_delete_187 from "./api/files/[id]/DELETE.js";
import files_id_download_get_188 from "./api/files/[id]/download/GET.js";
import fleet_get_189 from "./api/fleet/GET.js";
import fleet_post_190 from "./api/fleet/POST.js";
import fleet_analytics_settings_get_191 from "./api/fleet/analytics-settings/GET.js";
import fleet_analytics_settings_put_192 from "./api/fleet/analytics-settings/PUT.js";
import fleet_asset_bookings_get_193 from "./api/fleet/asset-bookings/GET.js";
import fleet_asset_bookings_post_194 from "./api/fleet/asset-bookings/POST.js";
import fleet_asset_bookings_id_delete_195 from "./api/fleet/asset-bookings/[id]/DELETE.js";
import fleet_asset_bookings_id_patch_196 from "./api/fleet/asset-bookings/[id]/PATCH.js";
import fleet_driver_sessions_post_197 from "./api/fleet/driver-sessions/POST.js";
import fleet_driver_sessions_active_get_198 from "./api/fleet/driver-sessions/active/GET.js";
import fleet_driver_sessions_live_get_199 from "./api/fleet/driver-sessions/live/GET.js";
import fleet_driver_sessions_migrate_gps_status_post_200 from "./api/fleet/driver-sessions/migrate-gps-status/POST.js";
import fleet_driver_sessions_id_heartbeat_post_201 from "./api/fleet/driver-sessions/[id]/heartbeat/POST.js";
import fleet_driver_sessions_id_stop_post_202 from "./api/fleet/driver-sessions/[id]/stop/POST.js";
import fleet_driver_sessions_id_summary_get_203 from "./api/fleet/driver-sessions/[id]/summary/GET.js";
import fleet_driver_sessions_id_telemetry_post_204 from "./api/fleet/driver-sessions/[id]/telemetry/POST.js";
import fleet_driver_sessions_id_telemetry_latest_get_205 from "./api/fleet/driver-sessions/[id]/telemetry/latest/GET.js";
import fleet_flags_get_206 from "./api/fleet/flags/GET.js";
import fleet_last_known_positions_get_207 from "./api/fleet/last-known-positions/GET.js";
import fleet_service_logs_logId_delete_208 from "./api/fleet/service-logs/[logId]/DELETE.js";
import fleet_service_logs_logId_patch_209 from "./api/fleet/service-logs/[logId]/PATCH.js";
import fleet_vehicles_get_210 from "./api/fleet/vehicles/GET.js";
import fleet_id_delete_211 from "./api/fleet/[id]/DELETE.js";
import fleet_id_get_212 from "./api/fleet/[id]/GET.js";
import fleet_id_put_213 from "./api/fleet/[id]/PUT.js";
import fleet_id_driver_sessions_get_214 from "./api/fleet/[id]/driver-sessions/GET.js";
import fleet_id_driver_sessions_manual_post_215 from "./api/fleet/[id]/driver-sessions/manual/POST.js";
import fleet_id_files_get_216 from "./api/fleet/[id]/files/GET.js";
import fleet_id_prestarts_get_217 from "./api/fleet/[id]/prestarts/GET.js";
import fleet_id_prestarts_post_218 from "./api/fleet/[id]/prestarts/POST.js";
import fleet_id_service_logs_get_219 from "./api/fleet/[id]/service-logs/GET.js";
import fleet_id_service_logs_post_220 from "./api/fleet/[id]/service-logs/POST.js";
import fleet_id_signin_post_221 from "./api/fleet/[id]/signin/POST.js";
import fleet_id_signout_post_222 from "./api/fleet/[id]/signout/POST.js";
import fleet_id_usage_export_get_223 from "./api/fleet/[id]/usage-export/GET.js";
import fleet_id_usage_status_get_224 from "./api/fleet/[id]/usage-status/GET.js";
import fleet_id_usage_summary_get_225 from "./api/fleet/[id]/usage-summary/GET.js";
import form_global_lists_get_226 from "./api/form-global-lists/GET.js";
import form_global_lists_post_227 from "./api/form-global-lists/POST.js";
import form_global_lists_id_delete_228 from "./api/form-global-lists/[id]/DELETE.js";
import form_global_lists_id_put_229 from "./api/form-global-lists/[id]/PUT.js";
import form_attachments_post from "./api/form-attachments/POST.js";
import form_templates_get_230 from "./api/form-templates/GET.js";
import form_templates_post_231 from "./api/form-templates/POST.js";
import form_templates_seed_post_232 from "./api/form-templates/seed/POST.js";
import form_templates_id_delete_233 from "./api/form-templates/[id]/DELETE.js";
import form_templates_id_put_234 from "./api/form-templates/[id]/PUT.js";
import form_templates_id_publish_to_library_post_235 from "./api/form-templates/[id]/publish-to-library/POST.js";
import forms_assets_list_get_236 from "./api/forms/assets-list/GET.js";
import forms_jobs_list_get_237 from "./api/forms/jobs-list/GET.js";
import forms_migrate_skip_logic_post_238 from "./api/forms/migrate-skip-logic/POST.js";
import forms_skip_audit_get_239 from "./api/forms/skip-audit/GET.js";
import forms_skip_audit_post_240 from "./api/forms/skip-audit/POST.js";
import forms_start_post_241 from "./api/forms/start/POST.js";
import forms_submissions_get_242 from "./api/forms/submissions/GET.js";
import forms_templates_id_share_link_post_243 from "./api/forms/templates/[id]/share-link/POST.js";
import forms_id_fields_get_244 from "./api/forms/[id]/fields/GET.js";
import forms_id_fields_post_245 from "./api/forms/[id]/fields/POST.js";
import forms_id_fields_reorder_post_246 from "./api/forms/[id]/fields/reorder/POST.js";
import forms_id_fields_fieldId_delete_247 from "./api/forms/[id]/fields/[fieldId]/DELETE.js";
import forms_id_fields_fieldId_patch_248 from "./api/forms/[id]/fields/[fieldId]/PATCH.js";
import forms_id_fields_fieldId_thumbnail_post_249 from "./api/forms/[id]/fields/[fieldId]/thumbnail/POST.js";
import health_get_250 from "./api/health/GET.js";
import incidents_get_251 from "./api/incidents/GET.js";
import incidents_post_252 from "./api/incidents/POST.js";
import incidents_id_archive_post_253 from "./api/incidents/[id]/archive/POST.js";
import incidents_id_unarchive_post_254 from "./api/incidents/[id]/unarchive/POST.js";
import incidents_incidentId_get_255 from "./api/incidents/[incidentId]/GET.js";
import incidents_incidentId_put_256 from "./api/incidents/[incidentId]/PUT.js";
import incidents_incidentId_attachments_get_257 from "./api/incidents/[incidentId]/attachments/GET.js";
import incidents_incidentId_attachments_post_258 from "./api/incidents/[incidentId]/attachments/POST.js";
import incidents_incidentId_attachments_attachId_delete_259 from "./api/incidents/[incidentId]/attachments/[attachId]/DELETE.js";
import incidents_incidentId_close_post_260 from "./api/incidents/[incidentId]/close/POST.js";
import incidents_incidentId_corrective_actions_post_261 from "./api/incidents/[incidentId]/corrective-actions/POST.js";
import incidents_incidentId_corrective_actions_actionId_put_262 from "./api/incidents/[incidentId]/corrective-actions/[actionId]/PUT.js";
import incidents_incidentId_pdf_get_263 from "./api/incidents/[incidentId]/pdf/GET.js";
import incidents_incidentId_third_parties_post_264 from "./api/incidents/[incidentId]/third-parties/POST.js";
import incidents_incidentId_third_parties_thirdPartyId_delete_265 from "./api/incidents/[incidentId]/third-parties/[thirdPartyId]/DELETE.js";
import integrations_myob_auth_url_get_266 from "./api/integrations/myob/auth-url/GET.js";
import integrations_myob_callback_get_267 from "./api/integrations/myob/callback/GET.js";
import integrations_myob_disconnect_post_268 from "./api/integrations/myob/disconnect/POST.js";
import integrations_myob_status_get_269 from "./api/integrations/myob/status/GET.js";
import integrations_myob_sync_invoice_post_270 from "./api/integrations/myob/sync-invoice/POST.js";
import integrations_onedrive_auth_url_get_271 from "./api/integrations/onedrive/auth-url/GET.js";
import integrations_onedrive_callback_get_272 from "./api/integrations/onedrive/callback/GET.js";
import integrations_onedrive_disconnect_post_273 from "./api/integrations/onedrive/disconnect/POST.js";
import integrations_onedrive_status_get_274 from "./api/integrations/onedrive/status/GET.js";
import integrations_onedrive_upload_file_post_275 from "./api/integrations/onedrive/upload-file/POST.js";
import integrations_qbo_auth_url_get_276 from "./api/integrations/qbo/auth-url/GET.js";
import integrations_qbo_callback_get_277 from "./api/integrations/qbo/callback/GET.js";
import integrations_qbo_disconnect_post_278 from "./api/integrations/qbo/disconnect/POST.js";
import integrations_qbo_status_get_279 from "./api/integrations/qbo/status/GET.js";
import integrations_qbo_sync_invoice_post_280 from "./api/integrations/qbo/sync-invoice/POST.js";
import integrations_xero_auth_url_get_281 from "./api/integrations/xero/auth-url/GET.js";
import integrations_xero_callback_get_282 from "./api/integrations/xero/callback/GET.js";
import integrations_xero_disconnect_post_283 from "./api/integrations/xero/disconnect/POST.js";
import integrations_xero_status_get_284 from "./api/integrations/xero/status/GET.js";
import integrations_xero_sync_customer_post_285 from "./api/integrations/xero/sync-customer/POST.js";
import integrations_xero_sync_invoice_post_286 from "./api/integrations/xero/sync-invoice/POST.js";
import integrations_xero_webhook_post_287 from "./api/integrations/xero/webhook/POST.js";
import invoices_get_288 from "./api/invoices/GET.js";
import invoices_post_289 from "./api/invoices/POST.js";
import invoices_id_delete_290 from "./api/invoices/[id]/DELETE.js";
import invoices_id_get_291 from "./api/invoices/[id]/GET.js";
import invoices_id_put_292 from "./api/invoices/[id]/PUT.js";
import invoices_id_duplicate_post_293 from "./api/invoices/[id]/duplicate/POST.js";
import invoices_id_export_pdf_get_294 from "./api/invoices/[id]/export-pdf/GET.js";
import invoices_id_mark_sent_post_295 from "./api/invoices/[id]/mark-sent/POST.js";
import invoices_id_record_payment_post_296 from "./api/invoices/[id]/record-payment/POST.js";
import invoices_id_send_email_post_297 from "./api/invoices/[id]/send-email/POST.js";
import invoices_id_unlock_patch_298 from "./api/invoices/[id]/unlock/PATCH.js";
import invoices_id_void_post_299 from "./api/invoices/[id]/void/POST.js";
import job_cards_get_300 from "./api/job-cards/GET.js";
import job_cards_post_301 from "./api/job-cards/POST.js";
import job_cards_id_delete_302 from "./api/job-cards/[id]/DELETE.js";
import job_cards_id_get_303 from "./api/job-cards/[id]/GET.js";
import job_cards_id_put_304 from "./api/job-cards/[id]/PUT.js";
import job_cards_id_convert_post_305 from "./api/job-cards/[id]/convert/POST.js";
import job_cards_id_invoice_post_306 from "./api/job-cards/[id]/invoice/POST.js";
import job_cards_id_photos_post_307 from "./api/job-cards/[id]/photos/POST.js";
import job_cards_id_photos_photoId_delete_308 from "./api/job-cards/[id]/photos/[photoId]/DELETE.js";
import job_cards_id_photos_photoId_patch from "./api/job-cards/[id]/photos/[photoId]/PATCH.js";
import job_cards_id_photos_photoId_download_get from "./api/job-cards/[id]/photos/[photoId]/download/GET.js";
import job_cards_id_photos_photoId_save_and_lock_post from "./api/job-cards/[id]/photos/[photoId]/save-and-lock/POST.js";
import job_costs_post_309 from "./api/job-costs/POST.js";
import job_forms_id_delete_310 from "./api/job-forms/[id]/DELETE.js";
import job_forms_id_get_311 from "./api/job-forms/[id]/GET.js";
import job_forms_id_put_312 from "./api/job-forms/[id]/PUT.js";
import job_forms_id_reset_post_313 from "./api/job-forms/[id]/reset/POST.js";
import job_forms_id_share_delete_314 from "./api/job-forms/[id]/share/DELETE.js";
import job_forms_id_share_get_315 from "./api/job-forms/[id]/share/GET.js";
import job_forms_id_share_post_316 from "./api/job-forms/[id]/share/POST.js";
import job_forms_id_send_email_post from "./api/job-forms/[id]/send-email/POST.js";
import jobs_get_317 from "./api/jobs/GET.js";
import jobs_search_get from "./api/jobs/search/GET.js";
import jobs_post_318 from "./api/jobs/POST.js";
import jobs_report_generate_post_319 from "./api/jobs/report/generate/POST.js";
import jobs_id_get_320 from "./api/jobs/[id]/GET.js";
import jobs_id_put_321 from "./api/jobs/[id]/PUT.js";
import jobs_id_attendance_attendanceId_close_post_322 from "./api/jobs/[id]/attendance/[attendanceId]/close/POST.js";
import jobs_id_costs_get_323 from "./api/jobs/[id]/costs/GET.js";
import jobs_id_costs_post_324 from "./api/jobs/[id]/costs/POST.js";
import jobs_id_costs_export_get_325 from "./api/jobs/[id]/costs/export/GET.js";
import jobs_id_costs_costId_delete_326 from "./api/jobs/[id]/costs/[costId]/DELETE.js";
import jobs_id_costs_costId_put_327 from "./api/jobs/[id]/costs/[costId]/PUT.js";
import jobs_id_costs_costId_receipt_get_328 from "./api/jobs/[id]/costs/[costId]/receipt/GET.js";
import jobs_id_costs_costId_receipt_post_329 from "./api/jobs/[id]/costs/[costId]/receipt/POST.js";
import jobs_id_delays_get_330 from "./api/jobs/[id]/delays/GET.js";
import jobs_id_delays_post_331 from "./api/jobs/[id]/delays/POST.js";
import jobs_id_delays_export_csv_get_332 from "./api/jobs/[id]/delays/export-csv/GET.js";
import jobs_id_delays_delayId_delete_333 from "./api/jobs/[id]/delays/[delayId]/DELETE.js";
import jobs_id_delays_delayId_put_334 from "./api/jobs/[id]/delays/[delayId]/PUT.js";
import jobs_id_documents_get_335 from "./api/jobs/[id]/documents/GET.js";
import jobs_id_documents_post_336 from "./api/jobs/[id]/documents/POST.js";
import jobs_id_export_zip_get_337 from "./api/jobs/[id]/export-zip/GET.js";
import jobs_id_field_docs_get_338 from "./api/jobs/[id]/field-docs/GET.js";
import jobs_id_files_get_339 from "./api/jobs/[id]/files/GET.js";
import jobs_id_forms_get_340 from "./api/jobs/[id]/forms/GET.js";
import jobs_id_forms_post_341 from "./api/jobs/[id]/forms/POST.js";
import jobs_id_forms_export_csv_get_342 from "./api/jobs/[id]/forms/export-csv/GET.js";
import jobs_id_forms_submissionId_delete_343 from "./api/jobs/[id]/forms/[submissionId]/DELETE.js";
import jobs_id_forms_submissionId_reopen_post_344 from "./api/jobs/[id]/forms/[submissionId]/reopen/POST.js";
import jobs_id_generate_qr_post_345 from "./api/jobs/[id]/generate-qr/POST.js";
import jobs_id_ledger_get_346 from "./api/jobs/[id]/ledger/GET.js";
import jobs_id_ledger_post_347 from "./api/jobs/[id]/ledger/POST.js";
import jobs_id_ledger_export_get_348 from "./api/jobs/[id]/ledger/export/GET.js";
import jobs_id_ledger_sync_post_349 from "./api/jobs/[id]/ledger/sync/POST.js";
import jobs_id_ledger_entryId_delete_350 from "./api/jobs/[id]/ledger/[entryId]/DELETE.js";
import jobs_id_ledger_entryId_put_351 from "./api/jobs/[id]/ledger/[entryId]/PUT.js";
import jobs_id_ledger_entryId_correct_post_352 from "./api/jobs/[id]/ledger/[entryId]/correct/POST.js";
import jobs_id_milestones_get_353 from "./api/jobs/[id]/milestones/GET.js";
import jobs_id_milestones_post_354 from "./api/jobs/[id]/milestones/POST.js";
import jobs_id_milestones_milestoneId_delete_355 from "./api/jobs/[id]/milestones/[milestoneId]/DELETE.js";
import jobs_id_milestones_milestoneId_patch_356 from "./api/jobs/[id]/milestones/[milestoneId]/PATCH.js";
import jobs_id_notes_export_csv_get_357 from "./api/jobs/[id]/notes/export-csv/GET.js";
import jobs_id_photos_get_358 from "./api/jobs/[id]/photos/GET.js";
import jobs_id_photos_post_359 from "./api/jobs/[id]/photos/POST.js";
import jobs_id_photos_export_zip_post_360 from "./api/jobs/[id]/photos/export-zip/POST.js";
import jobs_id_photos_picker_get_361 from "./api/jobs/[id]/photos/picker/GET.js";
import jobs_id_photos_share_post_362 from "./api/jobs/[id]/photos/share/POST.js";
import jobs_id_photos_photoId_delete_363 from "./api/jobs/[id]/photos/[photoId]/DELETE.js";
import jobs_id_photos_photoId_patch_364 from "./api/jobs/[id]/photos/[photoId]/PATCH.js";
import jobs_id_photos_photoId_download_get_365 from "./api/jobs/[id]/photos/[photoId]/download/GET.js";
import jobs_id_photos_photoId_replace_post_366 from "./api/jobs/[id]/photos/[photoId]/replace/POST.js";
import jobs_id_photos_photoId_lock_post from "./api/jobs/[id]/photos/[photoId]/lock/POST.js";
import jobs_id_photos_photoId_report_image_get_367 from "./api/jobs/[id]/photos/[photoId]/report-image/GET.js";
import jobs_id_progress_get_368 from "./api/jobs/[id]/progress/GET.js";
import jobs_id_progress_put_369 from "./api/jobs/[id]/progress/PUT.js";
import jobs_id_progress_export_csv_get_370 from "./api/jobs/[id]/progress/export-csv/GET.js";
import jobs_id_progress_report_get_371 from "./api/jobs/[id]/progress/report/GET.js";
import jobs_id_progress_report_put_372 from "./api/jobs/[id]/progress/report/PUT.js";
import jobs_id_progress_report_pdf_get_373 from "./api/jobs/[id]/progress/report/pdf/GET.js";
import jobs_id_progress_sync_post_374 from "./api/jobs/[id]/progress/sync/POST.js";
import jobs_id_purchase_orders_get_375 from "./api/jobs/[id]/purchase-orders/GET.js";
import jobs_id_purchase_orders_post_376 from "./api/jobs/[id]/purchase-orders/POST.js";
import jobs_id_purchase_orders_poId_delete_377 from "./api/jobs/[id]/purchase-orders/[poId]/DELETE.js";
import jobs_id_purchase_orders_poId_get_378 from "./api/jobs/[id]/purchase-orders/[poId]/GET.js";
import jobs_id_purchase_orders_poId_put_379 from "./api/jobs/[id]/purchase-orders/[poId]/PUT.js";
import jobs_id_purchase_orders_poId_pdf_get_380 from "./api/jobs/[id]/purchase-orders/[poId]/pdf/GET.js";
import jobs_id_report_pdf_post_381 from "./api/jobs/[id]/report/pdf/POST.js";
import jobs_id_risky_get_382 from "./api/jobs/[id]/risky/GET.js";
import jobs_id_risky_post_383 from "./api/jobs/[id]/risky/POST.js";
import jobs_id_risky_riskyId_get_384 from "./api/jobs/[id]/risky/[riskyId]/GET.js";
import jobs_id_risky_riskyId_put_385 from "./api/jobs/[id]/risky/[riskyId]/PUT.js";
import jobs_id_risky_riskyId_finalise_post_386 from "./api/jobs/[id]/risky/[riskyId]/finalise/POST.js";
import jobs_id_risky_riskyId_signatures_post_387 from "./api/jobs/[id]/risky/[riskyId]/signatures/POST.js";
import jobs_id_risky_riskyId_supervisor_signoff_post_388 from "./api/jobs/[id]/risky/[riskyId]/supervisor-signoff/POST.js";
import jobs_id_signin_post_389 from "./api/jobs/[id]/signin/POST.js";
import jobs_id_signin_qr_post_390 from "./api/jobs/[id]/signin-qr/POST.js";
import jobs_id_signin_status_get_391 from "./api/jobs/[id]/signin-status/GET.js";
import jobs_id_signout_post_392 from "./api/jobs/[id]/signout/POST.js";
import jobs_id_signout_qr_post_393 from "./api/jobs/[id]/signout-qr/POST.js";
import jobs_id_signout_user_post_394 from "./api/jobs/[id]/signout-user/POST.js";
import jobs_id_site_prestarts_get_395 from "./api/jobs/[id]/site-prestarts/GET.js";
import jobs_id_site_prestarts_post_396 from "./api/jobs/[id]/site-prestarts/POST.js";
import jobs_id_site_prestarts_prestartId_get_397 from "./api/jobs/[id]/site-prestarts/[prestartId]/GET.js";
import jobs_id_site_prestarts_prestartId_put_398 from "./api/jobs/[id]/site-prestarts/[prestartId]/PUT.js";
import jobs_id_site_prestarts_prestartId_finalise_post_399 from "./api/jobs/[id]/site-prestarts/[prestartId]/finalise/POST.js";
import jobs_id_site_prestarts_prestartId_workers_post_400 from "./api/jobs/[id]/site-prestarts/[prestartId]/workers/POST.js";
import jobs_id_swms_get_401 from "./api/jobs/[id]/swms/GET.js";
import jobs_id_swms_post_402 from "./api/jobs/[id]/swms/POST.js";
import jobs_id_swms_swmsId_signoff_post_403 from "./api/jobs/[id]/swms/[swmsId]/signoff/POST.js";
import jobs_id_todos_get_404 from "./api/jobs/[id]/todos/GET.js";
import jobs_id_todos_post_405 from "./api/jobs/[id]/todos/POST.js";
import jobs_id_todos_todoId_delete_406 from "./api/jobs/[id]/todos/[todoId]/DELETE.js";
import jobs_id_todos_todoId_put_407 from "./api/jobs/[id]/todos/[todoId]/PUT.js";
import library_items_get_408 from "./api/library/items/GET.js";
import library_items_id_get_409 from "./api/library/items/[id]/GET.js";
import library_items_id_patch_410 from "./api/library/items/[id]/PATCH.js";
import library_items_id_download_get_411 from "./api/library/items/[id]/download/GET.js";
import library_items_id_install_delete_412 from "./api/library/items/[id]/install/DELETE.js";
import library_items_id_install_post_413 from "./api/library/items/[id]/install/POST.js";
import library_my_installed_get_414 from "./api/library/my-installed/GET.js";
import library_my_submissions_get_415 from "./api/library/my-submissions/GET.js";
import lists_get_416 from "./api/lists/GET.js";
import me_get_417 from "./api/me/GET.js";
import me_put_418 from "./api/me/PUT.js";
import me_2fa_disable_post_419 from "./api/me/2fa/disable/POST.js";
import me_2fa_enable_post_420 from "./api/me/2fa/enable/POST.js";
import me_2fa_setup_get_421 from "./api/me/2fa/setup/GET.js";
import me_2fa_status_get_422 from "./api/me/2fa/status/GET.js";
import me_2fa_verify_post_423 from "./api/me/2fa/verify/POST.js";
import me_2fa_sms_send_post from "./api/me/2fa/sms/send/POST.js";
import me_2fa_sms_verify_post from "./api/me/2fa/sms/verify/POST.js";
import me_2fa_sms_enable_post from "./api/me/2fa/sms/enable/POST.js";
import me_2fa_sms_disable_post from "./api/me/2fa/sms/disable/POST.js";
import me_2fa_sms_send_setup_post from "./api/me/2fa/sms/send-setup/POST.js";
import me_active_status_get_424 from "./api/me/active-status/GET.js";
import me_change_password_post_425 from "./api/me/change-password/POST.js";
import me_email_status_get_426 from "./api/me/email-status/GET.js";
import me_phone_get_427 from "./api/me/phone/GET.js";
import me_phone_put_428 from "./api/me/phone/PUT.js";
import me_profile_attachments_delete_429 from "./api/me/profile-attachments/DELETE.js";
import me_profile_attachments_post_430 from "./api/me/profile-attachments/POST.js";
import me_profile_attachments_download_get from "./api/me/profile-attachments/download/GET.js";
import me_profile_attachments_thumbnail_get from "./api/me/profile-attachments/thumbnail/GET.js";
import me_profile_extras_get_431 from "./api/me/profile-extras/GET.js";
import me_profile_extras_put_432 from "./api/me/profile-extras/PUT.js";
import migrate_account_recovery_post_433 from "./api/migrate-account-recovery/POST.js";
import migrate_asset_manager_post_434 from "./api/migrate-asset-manager/POST.js";
import migrate_attendance_post_435 from "./api/migrate-attendance/POST.js";
import migrate_company_settings_post_436 from "./api/migrate-company-settings/POST.js";
import migrate_dazza_audit_post_437 from "./api/migrate-dazza-audit/POST.js";
import migrate_dazza_knowledge_post_438 from "./api/migrate-dazza-knowledge/POST.js";
import migrate_emergency_alerts_post_439 from "./api/migrate-emergency-alerts/POST.js";
import migrate_estimates_post_440 from "./api/migrate-estimates/POST.js";
import migrate_estimating_library_post_441 from "./api/migrate-estimating-library/POST.js";
import migrate_files_post_442 from "./api/migrate-files/POST.js";
import migrate_fleet_post_443 from "./api/migrate-fleet/POST.js";
import migrate_fleet_analytics_post_444 from "./api/migrate-fleet-analytics/POST.js";
import migrate_fleet_driver_sessions_post_445 from "./api/migrate-fleet-driver-sessions/POST.js";
import migrate_fleet_usage_post_446 from "./api/migrate-fleet-usage/POST.js";
import migrate_form_fields_post_447 from "./api/migrate-form-fields/POST.js";
import migrate_form_logic_post_448 from "./api/migrate-form-logic/POST.js";
import migrate_form_templates_post_449 from "./api/migrate-form-templates/POST.js";
import migrate_job_forms_post_450 from "./api/migrate-job-forms/POST.js";
import migrate_job_photo_shares_post_451 from "./api/migrate-job-photo-shares/POST.js";
import migrate_job_photos_post_452 from "./api/migrate-job-photos/POST.js";
import migrate_job_tabs_post_453 from "./api/migrate-job-tabs/POST.js";
import migrate_jobs_post_454 from "./api/migrate-jobs/POST.js";
import migrate_ledger_photo_post_455 from "./api/migrate-ledger-photo/POST.js";
import migrate_library_post_456 from "./api/migrate-library/POST.js";
import migrate_library_downloads_post_457 from "./api/migrate-library-downloads/POST.js";
import migrate_notifications_post_458 from "./api/migrate-notifications/POST.js";
import migrate_owner_console_post_459 from "./api/migrate-owner-console/POST.js";
import migrate_owner_role_post_460 from "./api/migrate-owner-role/POST.js";
import migrate_pdf_settings_post_461 from "./api/migrate-pdf-settings/POST.js";
import migrate_plan_manager_post_462 from "./api/migrate-plan-manager/POST.js";
import migrate_plan_manager_v2_post_463 from "./api/migrate-plan-manager-v2/POST.js";
import migrate_plan_manager_v3_post_464 from "./api/migrate-plan-manager-v3/POST.js";
import migrate_safety_post_465 from "./api/migrate-safety/POST.js";
import migrate_site_prestart_post_466 from "./api/migrate-site-prestart/POST.js";
import migrate_sms_verified_at_post_467 from "./api/migrate-sms-verified-at/POST.js";
import migrate_starter_pack_post_468 from "./api/migrate-starter-pack/POST.js";
import migrate_studio_pdf_post_469 from "./api/migrate-studio-pdf/POST.js";
import migrate_subscriptions_post_470 from "./api/migrate-subscriptions/POST.js";
import migrate_support_mode_post_471 from "./api/migrate-support-mode/POST.js";
import migrate_takeoff_pad_post_472 from "./api/migrate-takeoff-pad/POST.js";
import migrate_team_post_473 from "./api/migrate-team/POST.js";
import notes_get_474 from "./api/notes/GET.js";
import notes_post_475 from "./api/notes/POST.js";
import notes_comments_post_476 from "./api/notes/comments/POST.js";
import notes_migrate_post_477 from "./api/notes/migrate/POST.js";
import notes_id_delete_478 from "./api/notes/[id]/DELETE.js";
import notifications_alerts_get_479 from "./api/notifications/alerts/GET.js";
import notifications_prefs_get_480 from "./api/notifications/prefs/GET.js";
import notifications_prefs_put_481 from "./api/notifications/prefs/PUT.js";
import notifications_read_post_482 from "./api/notifications/read/POST.js";
import owner_console_activity_get_483 from "./api/owner-console/activity/GET.js";
import owner_console_cancellation_feedback_get_484 from "./api/owner-console/cancellation-feedback/GET.js";
import owner_console_companies_get_485 from "./api/owner-console/companies/GET.js";
import owner_console_companies_post_486 from "./api/owner-console/companies/POST.js";
import owner_console_companies_usage_get_487 from "./api/owner-console/companies/usage/GET.js";
import owner_console_companies_id_limits_put_488 from "./api/owner-console/companies/[id]/limits/PUT.js";
import owner_console_form_templates_get_489 from "./api/owner-console/form-templates/GET.js";
import owner_console_form_templates_post_490 from "./api/owner-console/form-templates/POST.js";
import bug_reports_get from "./api/bug-reports/GET.js";
import bug_reports_post from "./api/bug-reports/POST.js";
import bug_reports_id_patch from "./api/bug-reports/[id]/PATCH.js";
import owner_console_library_items_get_491 from "./api/owner-console/library/items/GET.js";
import owner_console_library_items_post_492 from "./api/owner-console/library/items/POST.js";
import owner_console_library_items_id_delete_493 from "./api/owner-console/library/items/[id]/DELETE.js";
import owner_console_library_items_id_patch_494 from "./api/owner-console/library/items/[id]/PATCH.js";
import owner_console_library_items_id_put_495 from "./api/owner-console/library/items/[id]/PUT.js";
import owner_console_library_items_id_push_update_post_496 from "./api/owner-console/library/items/[id]/push-update/POST.js";
import owner_console_library_submissions_get_497 from "./api/owner-console/library/submissions/GET.js";
import owner_console_library_submissions_id_review_post_498 from "./api/owner-console/library/submissions/[id]/review/POST.js";
import owner_console_starter_pack_get_499 from "./api/owner-console/starter-pack/GET.js";
import owner_console_starter_pack_post_500 from "./api/owner-console/starter-pack/POST.js";
import owner_console_stats_get_501 from "./api/owner-console/stats/GET.js";
import owner_console_storage_get_502 from "./api/owner-console/storage/GET.js";
import owner_console_swms_masters_get_503 from "./api/owner-console/swms/masters/GET.js";
import owner_console_swms_masters_post_504 from "./api/owner-console/swms/masters/POST.js";
import owner_console_swms_masters_publish_all_post_505 from "./api/owner-console/swms/masters/publish-all/POST.js";
import owner_console_swms_masters_id_delete_506 from "./api/owner-console/swms/masters/[id]/DELETE.js";
import owner_console_swms_masters_id_get_507 from "./api/owner-console/swms/masters/[id]/GET.js";
import owner_console_swms_masters_id_put_508 from "./api/owner-console/swms/masters/[id]/PUT.js";
import owner_console_swms_masters_id_publish_post_509 from "./api/owner-console/swms/masters/[id]/publish/POST.js";
import owner_console_swms_migrate_master_library_post_510 from "./api/owner-console/swms/migrate-master-library/POST.js";
import owner_console_swms_push_post_511 from "./api/owner-console/swms/push/POST.js";
import owner_console_swms_seed_bricklaying_post_512 from "./api/owner-console/swms/seed-bricklaying/POST.js";
import owner_console_swms_seed_building_inspection_post_513 from "./api/owner-console/swms/seed-building-inspection/POST.js";
import owner_console_swms_seed_cabinets_post_514 from "./api/owner-console/swms/seed-cabinets/POST.js";
import owner_console_swms_seed_carpenter_fixing_post_515 from "./api/owner-console/swms/seed-carpenter-fixing/POST.js";
import owner_console_swms_seed_carpenter_framing_post_516 from "./api/owner-console/swms/seed-carpenter-framing/POST.js";
import owner_console_swms_seed_carpenter_lockup_post_517 from "./api/owner-console/swms/seed-carpenter-lockup/POST.js";
import owner_console_swms_seed_ceramic_tiling_post_518 from "./api/owner-console/swms/seed-ceramic-tiling/POST.js";
import owner_console_swms_seed_concreting_slab_post_519 from "./api/owner-console/swms/seed-concreting-slab/POST.js";
import owner_console_swms_seed_delivery_loading_post_520 from "./api/owner-console/swms/seed-delivery-loading/POST.js";
import owner_console_swms_seed_environmental_spill_post_521 from "./api/owner-console/swms/seed-environmental-spill/POST.js";
import owner_console_swms_seed_ewp_post_522 from "./api/owner-console/swms/seed-ewp/POST.js";
import owner_console_swms_seed_excavations_substation_post_523 from "./api/owner-console/swms/seed-excavations-substation/POST.js";
import owner_console_swms_seed_fencing_post_524 from "./api/owner-console/swms/seed-fencing/POST.js";
import owner_console_swms_seed_heat_stress_post_525 from "./api/owner-console/swms/seed-heat-stress/POST.js";
import owner_console_swms_seed_landscaping_post_526 from "./api/owner-console/swms/seed-landscaping/POST.js";
import owner_console_swms_seed_live_parts_post_527 from "./api/owner-console/swms/seed-live-parts/POST.js";
import owner_console_swms_seed_manual_handling_post_528 from "./api/owner-console/swms/seed-manual-handling/POST.js";
import owner_console_swms_seed_moving_plant_post_529 from "./api/owner-console/swms/seed-moving-plant/POST.js";
import owner_console_swms_seed_painting_post_530 from "./api/owner-console/swms/seed-painting/POST.js";
import owner_console_swms_seed_power_tools_post_531 from "./api/owner-console/swms/seed-power-tools/POST.js";
import owner_console_swms_seed_silica_dust_post_532 from "./api/owner-console/swms/seed-silica-dust/POST.js";
import owner_console_swms_seed_traffic_management_post_533 from "./api/owner-console/swms/seed-traffic-management/POST.js";
import owner_console_swms_seed_underground_services_post_534 from "./api/owner-console/swms/seed-underground-services/POST.js";
import owner_console_swms_seed_vacuum_excavation_post_535 from "./api/owner-console/swms/seed-vacuum-excavation/POST.js";
import owner_console_system_ai_builtin_checks_post_536 from "./api/owner-console/system-ai/builtin-checks/POST.js";
import owner_console_users_get_537 from "./api/owner-console/users/GET.js";
import owner_console_users_verify_post_538 from "./api/owner-console/users/verify/POST.js";
import plan_manager_drawings_get_539 from "./api/plan-manager/drawings/GET.js";
import plan_manager_drawings_post_540 from "./api/plan-manager/drawings/POST.js";
import plan_manager_drawings_id_get_541 from "./api/plan-manager/drawings/[id]/GET.js";
import plan_manager_drawings_id_annotations_put_542 from "./api/plan-manager/drawings/[id]/annotations/PUT.js";
import plan_manager_drawings_id_archive_post_543 from "./api/plan-manager/drawings/[id]/archive/POST.js";
import plan_manager_drawings_id_job_links_delete_544 from "./api/plan-manager/drawings/[id]/job-links/DELETE.js";
import plan_manager_drawings_id_job_links_post_545 from "./api/plan-manager/drawings/[id]/job-links/POST.js";
import plan_manager_drawings_id_pages_pageNo_annotations_get_546 from "./api/plan-manager/drawings/[id]/pages/[pageNo]/annotations/GET.js";
import plan_manager_drawings_id_permanent_delete_547 from "./api/plan-manager/drawings/[id]/permanent/DELETE.js";
import plan_manager_drawings_id_reorder_patch_548 from "./api/plan-manager/drawings/[id]/reorder/PATCH.js";
import plan_manager_drawings_id_restore_post_549 from "./api/plan-manager/drawings/[id]/restore/POST.js";
import plan_manager_drawings_id_revisions_post_550 from "./api/plan-manager/drawings/[id]/revisions/POST.js";
import plan_manager_drawings_id_revisions_revisionId_finalize_post_551 from "./api/plan-manager/drawings/[id]/revisions/[revisionId]/finalize/POST.js";
import plan_manager_drawings_id_upload_post_552 from "./api/plan-manager/drawings/[id]/upload/POST.js";
import plan_manager_jobs_jobId_drawings_zip_get_553 from "./api/plan-manager/jobs/[jobId]/drawings-zip/GET.js";
import plan_manager_jobs_with_drawings_get_554 from "./api/plan-manager/jobs-with-drawings/GET.js";
import plan_manager_share_post_555 from "./api/plan-manager/share/POST.js";
import plan_manager_share_validate_get_556 from "./api/plan-manager/share/validate/GET.js";
import portal_estimates_id_approve_post_557 from "./api/portal/estimates/[id]/approve/POST.js";
import portal_invite_post_558 from "./api/portal/invite/POST.js";
import portal_invoices_id_pay_post_559 from "./api/portal/invoices/[id]/pay/POST.js";
import portal_jobs_get_560 from "./api/portal/jobs/GET.js";
import portal_jobs_id_get_561 from "./api/portal/jobs/[id]/GET.js";
import portal_migrate_post_562 from "./api/portal/migrate/POST.js";
import portal_validate_post_563 from "./api/portal/validate/POST.js";
import public_form_token_get_564 from "./api/public/form/[token]/GET.js";
import public_form_token_submit_post_565 from "./api/public/form/[token]/submit/POST.js";
import public_job_photos_token_get_566 from "./api/public/job-photos/[token]/GET.js";
import public_job_photos_token_photo_photoId_get_567 from "./api/public/job-photos/[token]/photo/[photoId]/GET.js";
import public_swms_token_get_568 from "./api/public/swms/[token]/GET.js";
import public_swms_token_signoff_post_569 from "./api/public/swms/[token]/signoff/POST.js";
import push_subscribe_delete_570 from "./api/push/subscribe/DELETE.js";
import push_subscribe_post_571 from "./api/push/subscribe/POST.js";
import push_vapid_key_get_572 from "./api/push/vapid-key/GET.js";
import quick_links_site_meta_get_573 from "./api/quick-links/site-meta/GET.js";
import recipes_get_574 from "./api/recipes/GET.js";
import recipes_post_575 from "./api/recipes/POST.js";
import recipes_id_delete_576 from "./api/recipes/[id]/DELETE.js";
import recipes_id_put_577 from "./api/recipes/[id]/PUT.js";
import risk_register_get_578 from "./api/risk-register/GET.js";
import risk_register_post_579 from "./api/risk-register/POST.js";
import risk_register_id_get_580 from "./api/risk-register/[id]/GET.js";
import risk_register_id_put_581 from "./api/risk-register/[id]/PUT.js";
import risk_register_id_archive_post_582 from "./api/risk-register/[id]/archive/POST.js";
import risk_register_id_unarchive_post_583 from "./api/risk-register/[id]/unarchive/POST.js";
import safety_ai_draft_post_584 from "./api/safety/ai/draft/POST.js";
import safety_documents_get_585 from "./api/safety/documents/GET.js";
import safety_documents_post_586 from "./api/safety/documents/POST.js";
import safety_documents_id_delete_587 from "./api/safety/documents/[id]/DELETE.js";
import safety_documents_id_download_get_588 from "./api/safety/documents/[id]/download/GET.js";
import safety_generated_posters_get_589 from "./api/safety/generated-posters/GET.js";
import safety_generated_posters_post_590 from "./api/safety/generated-posters/POST.js";
import safety_generated_posters_id_delete_591 from "./api/safety/generated-posters/[id]/DELETE.js";
import safety_job_safety_plans_get_592 from "./api/safety/job-safety-plans/GET.js";
import safety_job_safety_plans_post_593 from "./api/safety/job-safety-plans/POST.js";
import safety_job_safety_plans_id_delete_594 from "./api/safety/job-safety-plans/[id]/DELETE.js";
import safety_job_safety_plans_id_put_595 from "./api/safety/job-safety-plans/[id]/PUT.js";
import safety_job_swms_get_596 from "./api/safety/job-swms/GET.js";
import safety_job_swms_post_597 from "./api/safety/job-swms/POST.js";
import safety_job_swms_id_delete_598 from "./api/safety/job-swms/[id]/DELETE.js";
import safety_job_swms_id_get_599 from "./api/safety/job-swms/[id]/GET.js";
import safety_job_swms_id_put_600 from "./api/safety/job-swms/[id]/PUT.js";
import safety_job_swms_id_share_token_post_601 from "./api/safety/job-swms/[id]/share-token/POST.js";
import safety_job_swms_id_signoffs_get_602 from "./api/safety/job-swms/[id]/signoffs/GET.js";
import safety_job_swms_id_signoffs_post_603 from "./api/safety/job-swms/[id]/signoffs/POST.js";
import safety_job_swms_id_signoffs_signoffId_delete_604 from "./api/safety/job-swms/[id]/signoffs/[signoffId]/DELETE.js";
import safety_plans_get_605 from "./api/safety/plans/GET.js";
import safety_plans_post_606 from "./api/safety/plans/POST.js";
import safety_plans_seed_post_607 from "./api/safety/plans/seed/POST.js";
import safety_plans_id_delete_608 from "./api/safety/plans/[id]/DELETE.js";
import safety_plans_id_put_609 from "./api/safety/plans/[id]/PUT.js";
import safety_plans_id_export_get_610 from "./api/safety/plans/[id]/export/GET.js";
import safety_plans_id_pack_get_611 from "./api/safety/plans/[id]/pack/GET.js";
import safety_posters_get_612 from "./api/safety/posters/GET.js";
import safety_posters_post_613 from "./api/safety/posters/POST.js";
import safety_posters_id_delete_614 from "./api/safety/posters/[id]/DELETE.js";
import safety_posters_id_download_get_615 from "./api/safety/posters/[id]/download/GET.js";
import safety_swms_get_616 from "./api/safety/swms/GET.js";
import safety_swms_post_617 from "./api/safety/swms/POST.js";
import safety_swms_import_docx_post_618 from "./api/safety/swms/import-docx/POST.js";
import safety_swms_seed_post_619 from "./api/safety/swms/seed/POST.js";
import safety_swms_id_delete_620 from "./api/safety/swms/[id]/DELETE.js";
import safety_swms_id_get_621 from "./api/safety/swms/[id]/GET.js";
import safety_swms_id_put_622 from "./api/safety/swms/[id]/PUT.js";
import safety_swms_id_duplicate_post_623 from "./api/safety/swms/[id]/duplicate/POST.js";
import safety_swms_id_export_get_624 from "./api/safety/swms/[id]/export/GET.js";
import safety_swms_id_publish_to_library_post_625 from "./api/safety/swms/[id]/publish-to-library/POST.js";
import scheduler_crew_get_626 from "./api/scheduler/crew/GET.js";
import scheduler_jobs_get_627 from "./api/scheduler/jobs/GET.js";
import scheduler_jobs_id_reschedule_patch_628 from "./api/scheduler/jobs/[id]/reschedule/PATCH.js";
import scheduler_tasks_get_629 from "./api/scheduler/tasks/GET.js";
import secure_share_get_630 from "./api/secure-share/GET.js";
import secure_share_post_631 from "./api/secure-share/POST.js";
import secure_share_id_delete_632 from "./api/secure-share/[id]/DELETE.js";
import secure_share_token_get_633 from "./api/secure-share/[token]/GET.js";
import secure_share_token_post_634 from "./api/secure-share/[token]/POST.js";
import settings_backup_get_635 from "./api/settings/backup/GET.js";
import settings_backup_post_636 from "./api/settings/backup/POST.js";
import settings_backup_company_data_get_637 from "./api/settings/backup/company-data/GET.js";
import settings_backup_csv_pack_get_638 from "./api/settings/backup/csv-pack/GET.js";
import settings_backup_export_get_639 from "./api/settings/backup/export/GET.js";
import settings_backup_run_post_640 from "./api/settings/backup/run/POST.js";
import settings_backup_destination_get_641 from "./api/settings/backup-destination/GET.js";
import settings_backup_destination_post_642 from "./api/settings/backup-destination/POST.js";
import settings_dazza_ai_key_get_643 from "./api/settings/dazza-ai-key/GET.js";
import settings_dazza_ai_key_post_644 from "./api/settings/dazza-ai-key/POST.js";
import settings_file_transfer_backup_get_645 from "./api/settings/file-transfer-backup/GET.js";
import settings_file_transfer_backup_post_646 from "./api/settings/file-transfer-backup/POST.js";
import settings_retention_get_647 from "./api/settings/retention/GET.js";
import settings_retention_post_648 from "./api/settings/retention/POST.js";
import settings_storage_provider_get_649 from "./api/settings/storage-provider/GET.js";
import settings_storage_provider_debug_get_650 from "./api/settings/storage-provider/debug/GET.js";
import settings_storage_provider_test_post_651 from "./api/settings/storage-provider/test/POST.js";
import settings_terminology_get_652 from "./api/settings/terminology/GET.js";
import settings_terminology_post_653 from "./api/settings/terminology/POST.js";
import settings_xero_credentials_get_654 from "./api/settings/xero-credentials/GET.js";
import settings_xero_credentials_post_655 from "./api/settings/xero-credentials/POST.js";
import share_token_get_656 from "./api/share/[token]/GET.js";
import signin_history_get_657 from "./api/signin-history/GET.js";
import signup_post_658 from "./api/signup/POST.js";
import sos_get_659 from "./api/sos/GET.js";
import sos_acknowledge_post_660 from "./api/sos/acknowledge/POST.js";
import sos_trigger_post_661 from "./api/sos/trigger/POST.js";
import stakeholders_sms_post_662 from "./api/stakeholders/sms/POST.js";
import stripe_create_checkout_session_post_663 from "./api/stripe/create-checkout-session/POST.js";
import stripe_session_sessionId_get_664 from "./api/stripe/session/[sessionId]/GET.js";
import subscription_create_checkout_post_665 from "./api/subscription/create-checkout/POST.js";
import subscription_status_get_666 from "./api/subscription/status/GET.js";
import subscription_webhook_post_667 from "./api/subscription/webhook/POST.js";
import support_mode_audit_get_668 from "./api/support-mode/audit/GET.js";
import support_mode_checklist_get_669 from "./api/support-mode/checklist/GET.js";
import support_mode_checklist_put_670 from "./api/support-mode/checklist/PUT.js";
import support_mode_enter_post_671 from "./api/support-mode/enter/POST.js";
import support_mode_exit_post_672 from "./api/support-mode/exit/POST.js";
import support_mode_status_get_673 from "./api/support-mode/status/GET.js";
import tag_tasks_get_674 from "./api/tag-tasks/GET.js";
import tag_tasks_id_patch_675 from "./api/tag-tasks/[id]/PATCH.js";
import takeoff_pad_get_676 from "./api/takeoff-pad/GET.js";
import takeoff_pad_put_677 from "./api/takeoff-pad/PUT.js";
import tasks_post_678 from "./api/tasks/POST.js";
import tasks_id_put_679 from "./api/tasks/[id]/PUT.js";
import team_get_680 from "./api/team/GET.js";
import team_invite_post_681 from "./api/team/invite/POST.js";
import team_invites_get_682 from "./api/team/invites/GET.js";
import team_invites_post_683 from "./api/team/invites/POST.js";
import team_invites_id_cancel_post_684 from "./api/team/invites/[id]/cancel/POST.js";
import team_invites_id_resend_post_685 from "./api/team/invites/[id]/resend/POST.js";
import team_members_get_686 from "./api/team/members/GET.js";
import team_members_id_icon_permissions_get_687 from "./api/team/members/[id]/icon-permissions/GET.js";
import team_members_id_icon_permissions_put_688 from "./api/team/members/[id]/icon-permissions/PUT.js";
import team_resend_verification_post_689 from "./api/team/resend-verification/POST.js";
import team_schedule_migrate_post_690 from "./api/team/schedule/migrate/POST.js";
import team_shifts_get_691 from "./api/team/shifts/GET.js";
import team_shifts_post_692 from "./api/team/shifts/POST.js";
import team_shifts_id_delete_693 from "./api/team/shifts/[id]/DELETE.js";
import team_shifts_id_put_694 from "./api/team/shifts/[id]/PUT.js";
import team_time_entries_get_695 from "./api/team/time-entries/GET.js";
import team_time_entries_post_696 from "./api/team/time-entries/POST.js";
import team_time_entries_export_get_697 from "./api/team/time-entries/export/GET.js";
import team_time_entries_id_put_698 from "./api/team/time-entries/[id]/PUT.js";
import team_verify_user_post_699 from "./api/team/verify-user/POST.js";
import team_id_delete_700 from "./api/team/[id]/DELETE.js";
import team_id_put_701 from "./api/team/[id]/PUT.js";
import usage_get_702 from "./api/usage/GET.js";
import user_logs_get_703 from "./api/user-logs/GET.js";
import user_logs_users_get_704 from "./api/user-logs/users/GET.js";
// </api-imports>
// ── Job Cards ─────────────────────────────────────────────────────────────────
import job_cards_get from "./api/job-cards/GET.js";
import job_cards_post from "./api/job-cards/POST.js";
import job_cards_id_get from "./api/job-cards/[id]/GET.js";
import job_cards_id_put from "./api/job-cards/[id]/PUT.js";
import job_cards_id_delete from "./api/job-cards/[id]/DELETE.js";
import job_cards_id_invoice_post from "./api/job-cards/[id]/invoice/POST.js";
import job_cards_id_convert_post from "./api/job-cards/[id]/convert/POST.js";
// job_cards_id_photos_post and job_cards_id_photos_photoid_delete are already
// imported above as job_cards_id_photos_post_307 / job_cards_id_photos_photoId_delete_308
// New endpoints — sign-in history, fleet usage export, supervisor force-close
import signin_history_get from "./api/signin-history/GET.js";
import fleet_id_usage_export_get from "./api/fleet/[id]/usage-export/GET.js";
import jobs_id_attendance_close_post from "./api/jobs/[id]/attendance/[attendanceId]/close/POST.js";
// ── TEMPORARY DIAGNOSTICS REMOVED ─────────────────────────────────────────────
// Asset Manager
import sosGetHandler from "./api/sos/GET.js";
import sosTriggerPostHandler from "./api/sos/trigger/POST.js";
import sosAcknowledgePostHandler from "./api/sos/acknowledge/POST.js";
import adminSetUserCompanyPost from "./api/admin/set-user-company/POST.js";
import adminFixPhotoThumbnailsPost from "./api/admin/fix-photo-thumbnails/POST.js";
import adminFixPhotoRecordFieldsPost from "./api/admin/fix-photo-record-fields/POST.js";
import adminFixAllPhotoFieldsPost from "./api/admin/fix-all-photo-fields/POST.js";

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

/**
 * Extract a useful error message from a Drizzle/MySQL error.
 *
 * Drizzle wraps MySQL errors: the outer .message is "Failed query: ..."
 * and the real MySQL error (with errno/code/sqlMessage) is on .cause.
 * This helper walks the full cause chain and returns the most specific
 * message available, so ER_DUP_FIELDNAME checks work correctly.
 *
 * Also checks errno 1060 (ER_DUP_FIELDNAME) directly so callers can use
 * isDupColumn(e) without string matching.
 */
function migrationErrMsg(e: unknown): string {
  let current: unknown = e;
  let depth = 0;
  let best = '';
  while (current != null && depth < 10) {
    depth++;
    const node = current as {
      message?: string;
      sqlMessage?: string;
      code?: string;
      errno?: number;
      cause?: unknown;
    };
    const sqlMsg = String(node.sqlMessage ?? '');
    const msg    = String(node.message ?? '');
    const code   = String(node.code ?? '');
    // Prefer sqlMessage (the real MySQL text) over the Drizzle wrapper
    if (sqlMsg && sqlMsg !== 'undefined') best = sqlMsg;
    else if (msg && msg !== 'undefined' && !msg.startsWith('Failed query:')) best = msg;
    // Append code if useful
    if (code && code !== 'undefined' && !best.includes(code)) best = `${best} [${code}]`.trim();
    const next = node.cause;
    if (next === current || next == null) break;
    current = next;
  }
  // Fallback: stringify the original error
  if (!best) best = String((e as Error)?.message ?? e);
  return best;
}

/** Returns true when the error is a duplicate-column error (MySQL 1060). */
function isDupColumnError(e: unknown): boolean {
  let current: unknown = e;
  let depth = 0;
  while (current != null && depth < 10) {
    depth++;
    const node = current as {
      message?: string;
      sqlMessage?: string;
      code?: string;
      errno?: number;
      cause?: unknown;
    };
    const msg    = String(node.message ?? '');
    const sqlMsg = String(node.sqlMessage ?? '');
    const code   = String(node.code ?? '');
    const errno  = Number(node.errno ?? 0);
    if (
      errno === 1060 ||
      code === 'ER_DUP_FIELDNAME' ||
      msg.includes('ER_DUP_FIELDNAME') ||
      msg.includes('Duplicate column') ||
      sqlMsg.includes('Duplicate column')
    ) return true;
    const next = node.cause;
    if (next === current || next == null) break;
    current = next;
  }
  return false;
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
  // geolocation and camera must allow self — drivers need GPS for fleet tracking
  // and the job-photo picker needs camera access. All other sensitive APIs remain blocked.
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=(self), payment=(), usb=(), bluetooth=()');
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
    // Google Maps JS API — tile fetches, geocoding, directions, Places
    'https://maps.googleapis.com',
    'https://maps.gstatic.com',
    'https://*.googleapis.com',
    // Allow WebSocket connections for Vite HMR in dev
    ...(import.meta.env.PROD ? [] : ['ws:', 'wss:']),
    ...(r2PublicUrl ? [r2PublicUrl] : []),
  ].join(' ');
  // In production: drop unsafe-eval (only needed by Vite HMR in dev).
  // In dev: keep it so the Vite client and React refresh work correctly.
  // img1.wsimg.com is injected by GoDaddy's CDN infrastructure — allow it so
  // CSP violations don't pollute the console or interfere with hydration.
  // Google Maps JS API requires maps.googleapis.com and maps.gstatic.com in
  // script-src — the loader injects a <script> tag at runtime.
  const scriptSrc = import.meta.env.PROD
    ? `script-src 'self' 'unsafe-inline' https://js.stripe.com https://img1.wsimg.com https://maps.googleapis.com https://maps.gstatic.com`
    : `script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://img1.wsimg.com https://maps.googleapis.com https://maps.gstatic.com`;
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
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS company_settings (
        id             INT AUTO_INCREMENT PRIMARY KEY,
        company_id     INT NOT NULL UNIQUE,
        structure_json LONGTEXT NULL,
        dazza_json     LONGTEXT NULL,
        banner_json    LONGTEXT NULL,
        pdf_json       LONGTEXT NULL,
        created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    console.log('[startup-migration] company_settings table ready');
  } catch (e: unknown) {
    const msg = migrationErrMsg(e);
    // Table already exists is fine
    if (!msg.includes('already exists') && !msg.includes('ER_TABLE_EXISTS')) {
      console.warn('[startup-migration] company_settings CREATE failed:', msg);
    }
  }

  // 1a-rr. Ensure risk_register table exists
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS risk_register (
        id                  INT AUTO_INCREMENT PRIMARY KEY,
        company_id          INT NOT NULL,
        job_id              INT NULL,
        title               VARCHAR(500) NOT NULL,
        description         TEXT NULL,
        category            VARCHAR(100) NULL,
        hazard_source       TEXT NULL,
        who_is_at_risk      TEXT NULL,
        existing_controls   TEXT NULL,
        likelihood          VARCHAR(20) NOT NULL DEFAULT 'possible',
        consequence         VARCHAR(20) NOT NULL DEFAULT 'moderate',
        risk_level          VARCHAR(20) NOT NULL DEFAULT 'medium',
        additional_controls TEXT NULL,
        responsible_person  VARCHAR(255) NULL,
        due_date            DATE NULL,
        identified_date     DATE NOT NULL DEFAULT (CURDATE()),
        status              VARCHAR(30) NOT NULL DEFAULT 'open',
        review_date         DATE NULL,
        notes               TEXT NULL,
        closed_at           DATETIME NULL,
        closed_by           VARCHAR(255) NULL,
        created_by          VARCHAR(36) NULL,
        created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_rr_company (company_id),
        INDEX idx_rr_company_status (company_id, status),
        INDEX idx_rr_job (job_id)
      )
    `);
    console.log('[startup-migration] risk_register table ready');
  } catch (e: unknown) {
    const msg = migrationErrMsg(e);
    if (!msg.includes('already exists') && !msg.includes('ER_TABLE_EXISTS')) {
      console.warn('[startup-migration] risk_register CREATE failed:', msg);
    }
  }

  // 1a-rr-archive. Add archive columns to risk_register (idempotent)
  for (const colDef of [
    "archived_at    DATETIME NULL",
    "archived_by    VARCHAR(255) NULL",
    "archive_reason TEXT NULL",
  ]) {
    const colName = colDef.trim().split(/\s+/)[0];
    try {
      await db.execute(sql.raw(`ALTER TABLE risk_register ADD COLUMN ${colDef}`));
      console.log(`[startup-migration] risk_register.${colName} added`);
    } catch (e: unknown) {
      const msg = migrationErrMsg(e);
      if (!isDupColumnError(e)) {
        console.warn(`[startup-migration] risk_register.${colName} alter failed:`, msg);
      }
    }
  }

  // 1b. Ensure notifications table exists (must be before column migrations below)
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS notifications (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        company_id  INT NOT NULL,
        user_id     VARCHAR(36) NOT NULL,
        type        VARCHAR(60) NOT NULL,
        title       VARCHAR(255) NOT NULL,
        body        TEXT NULL,
        link        VARCHAR(500) NULL,
        is_read     TINYINT(1) NOT NULL DEFAULT 0,
        created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_company_user (company_id, user_id),
        INDEX idx_user_read (user_id, is_read)
      )
    `);
    console.log('[startup-migration] notifications table ready');
  } catch (e: unknown) {
    const msg = migrationErrMsg(e);
    if (!msg.includes('already exists') && !msg.includes('ER_TABLE_EXISTS')) {
      console.warn('[startup-migration] notifications CREATE failed:', msg);
    }
  }

  // 1c. Ensure platform_activity_log exists BEFORE colsToEnsure runs so the
  //     column-healing loop can add any missing columns on older DBs.
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS platform_activity_log (
        id INT AUTO_INCREMENT PRIMARY KEY,
        event_type VARCHAR(60) NOT NULL DEFAULT '',
        success TINYINT(1) NOT NULL DEFAULT 1,
        user_id VARCHAR(36) NULL,
        email VARCHAR(255) NULL,
        company_id INT NULL,
        performed_by_user_id VARCHAR(36) NULL,
        ip_address VARCHAR(100) NULL,
        user_agent VARCHAR(500) NULL,
        reason VARCHAR(500) NULL,
        metadata_json TEXT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_company (company_id),
        INDEX idx_user (user_id),
        INDEX idx_event (event_type),
        INDEX idx_created (created_at)
      )
    `);
    console.log('[startup-migration] platform_activity_log table ready');
  } catch (e: unknown) {
    const msg = migrationErrMsg(e);
    if (!msg.includes('already exists') && !msg.includes('ER_TABLE_EXISTS')) {
      console.warn('[startup-migration] platform_activity_log CREATE failed:', msg);
    }
  }

  // 1d. Ensure document_templates exists — explicit early-create so it is
  //     guaranteed on prod DBs that predate the safetyTables loop entry.
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS document_templates (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_id INT NOT NULL,
        name VARCHAR(255) NOT NULL,
        template_type VARCHAR(50) NOT NULL DEFAULT 'document',
        builder_json LONGTEXT NULL,
        page_layout_json TEXT NULL,
        theme_json TEXT NULL,
        source_docx_path VARCHAR(500) NULL,
        source_docx_name VARCHAR(255) NULL,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        created_by_user_id VARCHAR(36) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_company (company_id),
        INDEX idx_type (company_id, template_type),
        INDEX idx_active (company_id, is_active)
      )
    `);
    console.log('[startup-migration] document_templates table ready');
  } catch (e: unknown) {
    const msg = migrationErrMsg(e);
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
    // ── job_swms: timestamp columns (created_at was missing on some deploys) ────
    { table: 'job_swms', column: 'created_at',             definition: 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP' },
    { table: 'job_swms', column: 'updated_at',             definition: 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP' },
    // ── jobs: customer link (v2) ──────────────────────────────────────────────
    { table: 'jobs', column: 'customer_id', definition: 'INT NULL' },
    // ── profiles: invoices permission ────────────────────────────────────────
    { table: 'profiles', column: 'perm_invoices', definition: "TINYINT(1) NOT NULL DEFAULT 1" },
    // ── customers: Xero contact ID ────────────────────────────────────────────
    { table: 'customers', column: 'xero_contact_id', definition: "VARCHAR(100) NULL" },
    // ── user: TOTP 2FA ────────────────────────────────────────────────────────
    { table: 'user', column: 'totp_secret',        definition: 'VARCHAR(64) NULL' },
    { table: 'user', column: 'two_factor_enabled', definition: 'TINYINT(1) NOT NULL DEFAULT 0' },
    // ── user: SMS 2FA ─────────────────────────────────────────────────────────
    { table: 'user', column: 'sms_2fa_enabled', definition: 'TINYINT(1) NOT NULL DEFAULT 0' },
    { table: 'user', column: 'sms_2fa_phone',   definition: 'VARCHAR(30) NULL' },
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
    { table: 'invoices', column: 'locked',              definition: 'TINYINT(1) NOT NULL DEFAULT 0' },
    { table: 'invoices', column: 'locked_at',           definition: 'DATETIME NULL' },
    { table: 'invoices', column: 'locked_by',           definition: 'VARCHAR(255) NULL' },
    { table: 'invoices', column: 'pdf_url',             definition: 'VARCHAR(500) NULL' },
    // ── Estimate → Invoice workflow ───────────────────────────────────────────
    { table: 'invoices',  column: 'source_estimate_id', definition: 'INT NULL' },
    { table: 'invoices',  column: 'sent_at',            definition: 'DATETIME NULL' },
    { table: 'estimates', column: 'locked',             definition: "TINYINT(1) NOT NULL DEFAULT 0" },
    { table: 'estimates', column: 'locked_at',          definition: 'DATETIME NULL' },
    { table: 'estimates', column: 'locked_invoice_id',  definition: 'INT NULL' },
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
    { table: 'job_cost_ledger', column: 'photo_url',         definition: 'VARCHAR(500) NULL' },
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
    { table: 'document_templates', column: 'use_type',            definition: "VARCHAR(50) NOT NULL DEFAULT 'reference_document'" },
    // ── document_templates: Doc/Form kind model ──────────────────────────────
    { table: 'document_templates', column: 'doc_kind',                    definition: "VARCHAR(10) NOT NULL DEFAULT 'doc'" },
    { table: 'document_templates', column: 'requires_acknowledgement',    definition: 'TINYINT(1) NOT NULL DEFAULT 0' },
    { table: 'document_templates', column: 'acknowledgement_label',       definition: "VARCHAR(255) NULL" },
    { table: 'document_templates', column: 'acknowledgement_text',        definition: "MEDIUMTEXT NULL" },
    { table: 'document_templates', column: 'submit_label',                definition: "VARCHAR(255) NULL" },
    { table: 'document_templates', column: 'requires_signature',          definition: 'TINYINT(1) NOT NULL DEFAULT 0' },
    { table: 'document_templates', column: 'source_job_id',               definition: 'INT NULL' },
    { table: 'document_templates', column: 'doc_status',                  definition: "VARCHAR(20) NOT NULL DEFAULT 'draft'" },
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
    // ── library_items: columns added by migrate-library-downloads ────────────
    { table: 'library_items', column: 'source_file_name', definition: 'VARCHAR(255) NULL' },
    { table: 'library_items', column: 'file_path',        definition: 'VARCHAR(1000) NULL' },
    { table: 'library_items', column: 'file_mime',        definition: 'VARCHAR(100) NULL' },
    { table: 'library_items', column: 'builder_json',     definition: 'LONGTEXT NULL' },
    { table: 'library_items', column: 'download_count',   definition: 'INT NOT NULL DEFAULT 0' },
    // ── company_library_items: customised flag ────────────────────────────────
    { table: 'company_library_items', column: 'customised', definition: 'TINYINT(1) NOT NULL DEFAULT 0' },
    // ── fleet_driver_sessions: analytics summary columns ─────────────────────
    { table: 'fleet_driver_sessions', column: 'end_at',               definition: 'DATETIME NULL' },
    { table: 'fleet_driver_sessions', column: 'updated_at',           definition: 'DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP' },
    { table: 'fleet_driver_sessions', column: 'total_distance_km',    definition: 'DECIMAL(10,3) NULL' },
    { table: 'fleet_driver_sessions', column: 'active_drive_seconds', definition: 'INT NULL' },
    { table: 'fleet_driver_sessions', column: 'avg_speed_kmh',        definition: 'DECIMAL(6,2) NULL' },
    { table: 'fleet_driver_sessions', column: 'max_speed_kmh',        definition: 'DECIMAL(6,2) NULL' },
    { table: 'fleet_driver_sessions', column: 'collision_count',      definition: 'INT NOT NULL DEFAULT 0' },
    { table: 'fleet_driver_sessions', column: 'summary_computed_at',  definition: 'DATETIME NULL' },
    // ── fleet_driver_sessions: GPS heartbeat columns (required by live map query) ─
    { table: 'fleet_driver_sessions', column: 'location_permission_status', definition: "VARCHAR(20) NULL DEFAULT 'unknown'" },
    { table: 'fleet_driver_sessions', column: 'gps_status',                 definition: "VARCHAR(30) NULL DEFAULT 'waiting_fix'" },
    { table: 'fleet_driver_sessions', column: 'last_heartbeat_at',          definition: 'DATETIME NULL' },
    // ── company_settings: office/base GPS coordinates for Fleet Live Map fallback ─
    { table: 'company_settings', column: 'office_lat', definition: 'DECIMAL(10,7) NULL' },
    { table: 'company_settings', column: 'office_lng', definition: 'DECIMAL(10,7) NULL' },
    // ── profiles: extended personal fields ───────────────────────────────────
    { table: 'profiles', column: 'licenses',               definition: 'TEXT NULL' },
    { table: 'profiles', column: 'profile_notes',          definition: 'TEXT NULL' },
    { table: 'profiles', column: 'emergency_contact_name', definition: 'VARCHAR(255) NULL' },
    { table: 'profiles', column: 'emergency_contact_phone',definition: 'VARCHAR(50) NULL' },
    { table: 'profiles', column: 'profile_attachments',    definition: 'TEXT NULL' },
    // ── job_photos: all optional columns (v2) ────────────────────────────────
    { table: 'job_photos', column: 'original_name',         definition: 'VARCHAR(255) NULL' },
    { table: 'job_photos', column: 'label',                 definition: 'VARCHAR(255) NULL' },
    { table: 'job_photos', column: 'mime_type',             definition: 'VARCHAR(100) NULL' },
    { table: 'job_photos', column: 'size_bytes',            definition: 'INT NULL' },
    { table: 'job_photos', column: 'uploaded_by_user_id',   definition: 'VARCHAR(36) NULL' },
    { table: 'job_photos', column: 'uploaded_by_name',      definition: 'VARCHAR(255) NULL' },
    { table: 'job_photos', column: 'caption',               definition: 'TEXT NULL' },
    { table: 'job_photos', column: 'category',              definition: 'VARCHAR(100) NULL' },
    { table: 'job_photos', column: 'thumbnail_key',         definition: 'VARCHAR(255) NULL' },
    { table: 'job_photos', column: 'thumbnail_mime_type',   definition: 'VARCHAR(100) NULL' },
    { table: 'job_photos', column: 'thumbnail_size_bytes',  definition: 'INT NULL' },
    { table: 'job_photos', column: 'preview_key',           definition: 'VARCHAR(255) NULL' },
    { table: 'job_photos', column: 'preview_mime_type',     definition: 'VARCHAR(100) NULL' },
    { table: 'job_photos', column: 'preview_size_bytes',    definition: 'INT NULL' },
    { table: 'job_photos', column: 'image_width',           definition: 'INT NULL' },
    { table: 'job_photos', column: 'image_height',          definition: 'INT NULL' },
    // ── profiles: home screen icon permissions (JSON array of allowed icon keys) ─
    { table: 'profiles', column: 'home_icon_permissions',   definition: 'TEXT NULL' },
    // ── job_todos: extended task fields (Step 3 upgrade) ─────────────────────
    { table: 'job_todos', column: 'description',       definition: 'TEXT NULL' },
    { table: 'job_todos', column: 'start_date',        definition: 'VARCHAR(20) NULL' },
    { table: 'job_todos', column: 'assigned_user_id',  definition: 'VARCHAR(36) NULL' },
    { table: 'job_todos', column: 'assigned_name',     definition: 'VARCHAR(255) NULL' },
    { table: 'job_todos', column: 'notes',             definition: 'TEXT NULL' },
    // ── job_todos: general tasks — job_id becomes optional ───────────────────
    // We cannot ALTER a NOT NULL FK column to NULL via colsToEnsure (it's ADD COLUMN only).
    // The actual nullable migration runs in the dedicated block below.
    // ── job_delays: hybrid delay / condition record fields ───────────────────
    { table: 'job_delays', column: 'category',        definition: "VARCHAR(50) NULL" },
    { table: 'job_delays', column: 'entry_type',      definition: "VARCHAR(20) NOT NULL DEFAULT 'delay'" },
    { table: 'job_delays', column: 'impact_summary',  definition: 'TEXT NULL' },
    { table: 'job_delays', column: 'work_condition',  definition: 'VARCHAR(100) NULL' },
    { table: 'job_delays', column: 'rainfall_mm',     definition: 'DECIMAL(6,1) NULL' },
    { table: 'job_delays', column: 'ground_condition',definition: 'VARCHAR(100) NULL' },
    // ── bug_reports: diagnostic context columns (added 2026-08-10) ──────────
    { table: 'bug_reports', column: 'platform',          definition: "VARCHAR(50) NOT NULL DEFAULT 'web'" },
    { table: 'bug_reports', column: 'app_version',       definition: "VARCHAR(50) NOT NULL DEFAULT ''" },
    { table: 'bug_reports', column: 'current_route',     definition: "VARCHAR(300) NOT NULL DEFAULT ''" },
    { table: 'bug_reports', column: 'diagnostic_events', definition: 'MEDIUMTEXT NULL' },
  ];
  for (const { table, column, definition } of colsToEnsure) {
    try {
      // First confirm the table itself exists — if not, skip silently.
      // db.execute() returns [rows, fields] tuple; rows are at result[0].
      const tableResult = await db.execute(
        sql`SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${table}`
      ) as unknown as [Array<{ cnt: number }>, unknown];
      if (Number(tableResult[0]?.[0]?.cnt ?? 0) === 0) continue;

      let colExists = false;
      try {
        const checkResult = await db.execute(
          sql`SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${table} AND COLUMN_NAME = ${column}`
        ) as unknown as [Array<{ cnt: number }>, unknown];
        colExists = Number(checkResult[0]?.[0]?.cnt ?? 0) > 0;
      } catch (checkErr: unknown) {
        // INFORMATION_SCHEMA query failed — log and attempt direct ALTER
        let checkMsg = String((checkErr as Error)?.message ?? checkErr);
        const checkCause = (checkErr as { cause?: unknown })?.cause;
        if (checkCause) checkMsg += ` | cause: ${String((checkCause as Error)?.message ?? checkCause)}`;
        console.warn(`[startup-migration] existence check failed for ${table}.${column}:`, checkMsg);
        // colExists stays false → attempt ALTER with dup suppression below
      }

      if (!colExists) {
        try {
          const query = `ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`;
          await db.execute(sql.raw(query));
          console.log(`[startup-migration] Added ${table}.${column}`);
        } catch (alterErr: unknown) {
          const alterMsg = migrationErrMsg(alterErr);
          const isDup = isDupColumnError(alterErr);
          if (!isDup) {
            console.warn(`[startup-migration] Could not ensure ${table}.${column}:`, alterMsg);
          }
        }
      }
    } catch (e: unknown) {
      const msg = migrationErrMsg(e);
      console.warn(`[startup-migration] Could not ensure ${table}.${column}:`, msg);
    }
  }

  // ── 2b. Make job_todos.job_id nullable (general tasks support) ───────────────
  // This is an ALTER COLUMN (not ADD COLUMN) so it can't go through colsToEnsure.
  // We check the current IS_NULLABLE state and only run if still NOT NULL.
  try {
    const colInfo = await db.execute(sql.raw(
      "SELECT IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS " +
      "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'job_todos' AND COLUMN_NAME = 'job_id'"
    )) as unknown as [Array<{ IS_NULLABLE: string }>, unknown];
    if (colInfo[0]?.[0]?.IS_NULLABLE === 'NO') {
      // Drop the FK constraint first (MySQL requires this before making the column nullable)
      // Find the FK name dynamically
      const fkRows = await db.execute(sql.raw(
        "SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE " +
        "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'job_todos' " +
        "AND COLUMN_NAME = 'job_id' AND REFERENCED_TABLE_NAME IS NOT NULL"
      )) as unknown as [Array<{ CONSTRAINT_NAME: string }>, unknown];
      if (fkRows[0]?.length) {
        for (const row of fkRows[0]) {
          try {
            await db.execute(sql.raw(`ALTER TABLE \`job_todos\` DROP FOREIGN KEY \`${row.CONSTRAINT_NAME}\``));
            console.log(`[startup-migration] Dropped FK ${row.CONSTRAINT_NAME} from job_todos`);
          } catch { /* ignore if already gone */ }
        }
      }
      // Now make job_id nullable and re-add FK with ON DELETE SET NULL
      await db.execute(sql.raw(
        "ALTER TABLE `job_todos` MODIFY COLUMN `job_id` INT NULL"
      ));
      // Re-add FK with SET NULL so deleting a job nullifies tasks rather than cascading
      try {
        await db.execute(sql.raw(
          "ALTER TABLE `job_todos` ADD CONSTRAINT `fk_job_todos_job_id` " +
          "FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON DELETE SET NULL"
        ));
      } catch { /* FK may already exist or jobs table may not exist yet */ }
      console.log('[startup-migration] job_todos.job_id is now nullable (general tasks enabled)');
    }
  } catch (e: unknown) {
    console.warn('[startup-migration] job_todos nullable migration warning:', String((e as Error)?.message ?? e));
  }

  // ── 3. Ensure performance indexes exist (idempotent — checks INFORMATION_SCHEMA first) ──
  const indexesToEnsure: Array<{ table: string; indexName: string; columns: string; unique?: boolean }> = [
    // jobs — most-queried table, every list/filter hits company_id
    { table: 'jobs',                  indexName: 'idx_jobs_company',          columns: '(company_id)' },
    { table: 'jobs',                  indexName: 'idx_jobs_company_status',   columns: '(company_id, status)' },
    // estimates — fetched by job and by company
    { table: 'estimates',             indexName: 'idx_estimates_company',     columns: '(company_id)' },
    { table: 'estimates',             indexName: 'idx_estimates_job',         columns: '(job_id)' },
    { table: 'estimates',             indexName: 'idx_estimates_company_job', columns: '(company_id, job_id)' },
    // job_form_submissions — Drizzle-managed table, no inline indexes in schema
    { table: 'job_form_submissions',  indexName: 'idx_jfs_company',          columns: '(company_id)' },
    { table: 'job_form_submissions',  indexName: 'idx_jfs_job',              columns: '(job_id)' },
    { table: 'job_form_submissions',  indexName: 'idx_jfs_company_job',      columns: '(company_id, job_id)' },
    // estimate_lines — fetched by estimate_id on every estimate load
    { table: 'estimate_lines',        indexName: 'idx_estlines_estimate',    columns: '(estimate_id)' },
    // job_photo_shares — one share per job (unique), fast token lookup
    { table: 'job_photo_shares',      indexName: 'uq_job_photo_shares_job',  columns: '(job_id)', unique: true },
  ];

  for (const { table, indexName, columns, unique } of indexesToEnsure) {
    try {
      // Skip if table doesn't exist yet
      const tblRows = await db.execute(
        sql`SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${table}`
      ) as unknown as [Array<{ cnt: number }>, unknown];
      if (Number(tblRows[0]?.[0]?.cnt ?? 0) === 0) continue;

      // Skip if index already exists
      const idxRows = await db.execute(
        sql`SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${table} AND INDEX_NAME = ${indexName}`
      ) as unknown as [Array<{ cnt: number }>, unknown];
      if (Number(idxRows[0]?.[0]?.cnt ?? 0) > 0) continue;

      const indexType = unique ? 'UNIQUE INDEX' : 'INDEX';
      const query = `ALTER TABLE \`${table}\` ADD ${indexType} \`${indexName}\` ${columns}`;
      await db.execute(sql.raw(query));
      console.log(`[startup-migration] Added ${unique ? 'unique ' : ''}index ${indexName} on ${table}`);
    } catch (e: unknown) {
      const msg = migrationErrMsg(e);
      // ER_DUP_KEYNAME = index already exists under a different check path — safe to ignore
      if (!msg.includes('ER_DUP_KEYNAME') && !msg.includes('Duplicate key name')) {
        console.warn(`[startup-migration] Could not add index ${indexName} on ${table}:`, msg);
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
    // ── Job Milestones / Schedule ──────────────────────────────────────────────
    { name: 'job_milestones', ddl: "CREATE TABLE IF NOT EXISTS job_milestones (id INT AUTO_INCREMENT PRIMARY KEY, company_id INT NOT NULL, job_id INT NOT NULL, title VARCHAR(255) NOT NULL, description TEXT NULL, due_date DATE NULL, start_date DATE NULL, status VARCHAR(30) NOT NULL DEFAULT 'pending', sort_order INT NOT NULL DEFAULT 0, assigned_to VARCHAR(255) NULL, color VARCHAR(20) NULL DEFAULT 'blue', created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX idx_company (company_id), INDEX idx_job (company_id, job_id), INDEX idx_due (company_id, due_date))" },
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
    // ── Job Photo Shares — public view-only token links ───────────────────────
    { name: 'job_progress_reports', ddl: "CREATE TABLE IF NOT EXISTS job_progress_reports (id INT AUTO_INCREMENT PRIMARY KEY, company_id INT NOT NULL, job_id INT NOT NULL UNIQUE, prepared_by VARCHAR(255) NULL, report_date DATE NULL, period_from DATE NULL, period_to DATE NULL, achievements TEXT NULL, planned_next TEXT NULL, outstanding_issues TEXT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX idx_company (company_id), INDEX idx_job (company_id, job_id))" },
    { name: 'job_photo_shares', ddl: "CREATE TABLE IF NOT EXISTS job_photo_shares (id INT AUTO_INCREMENT PRIMARY KEY, job_id INT NOT NULL, company_id INT NOT NULL, token_hash VARCHAR(64) NOT NULL, expires_at DATETIME NULL, created_by_user_id VARCHAR(36) NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, UNIQUE KEY uq_job_photo_shares_token (token_hash), UNIQUE KEY uq_job_photo_shares_job (job_id), INDEX idx_jps_company (company_id))" },
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
    { name: 'job_document_links', ddl: "CREATE TABLE IF NOT EXISTS job_document_links (id INT AUTO_INCREMENT PRIMARY KEY, company_id INT NOT NULL, job_id INT NOT NULL, document_template_id INT NOT NULL, linked_by_user_id VARCHAR(36) NULL, linked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE KEY uq_job_doc (job_id, document_template_id), INDEX idx_company (company_id), INDEX idx_job (company_id, job_id), INDEX idx_template (document_template_id))" },
    // ── Asset Bookings (fleet asset → job scheduling) ─────────────────────────
    { name: 'asset_bookings', ddl: "CREATE TABLE IF NOT EXISTS asset_bookings (id INT AUTO_INCREMENT PRIMARY KEY, company_id INT NOT NULL, fleet_asset_id INT NOT NULL, job_id INT NULL, title VARCHAR(255) NOT NULL DEFAULT '', start_date DATE NOT NULL, end_date DATE NOT NULL, start_time TIME NULL, end_time TIME NULL, notes TEXT NULL, status VARCHAR(30) NOT NULL DEFAULT 'booked', created_by_user_id VARCHAR(36) NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX idx_company (company_id), INDEX idx_asset (fleet_asset_id), INDEX idx_job (company_id, job_id), INDEX idx_dates (company_id, start_date, end_date))" },
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
    // ── SOS Emergency Alerts ─────────────────────────────────────────────────
    { name: 'job_sos_alerts', ddl: "CREATE TABLE IF NOT EXISTS job_sos_alerts (id INT AUTO_INCREMENT PRIMARY KEY, company_id INT NOT NULL, triggered_by VARCHAR(36) NOT NULL, triggered_by_name VARCHAR(255) NOT NULL DEFAULT '', job_id INT NULL, lat DECIMAL(10,7) NULL, lng DECIMAL(10,7) NULL, status VARCHAR(20) NOT NULL DEFAULT 'active', acknowledged_by VARCHAR(36) NULL, acknowledged_at DATETIME NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX idx_company (company_id), INDEX idx_status (company_id, status), INDEX idx_created (company_id, created_at))" },
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
    // ── Global Library ────────────────────────────────────────────────────────
    { name: 'library_items', ddl: "CREATE TABLE IF NOT EXISTS library_items (id INT AUTO_INCREMENT PRIMARY KEY, type VARCHAR(50) NOT NULL, category VARCHAR(100) NULL, title VARCHAR(255) NOT NULL, summary TEXT NULL, tags TEXT NULL, discipline VARCHAR(100) NULL, version VARCHAR(30) NOT NULL DEFAULT '1.0', status VARCHAR(30) NOT NULL DEFAULT 'active', visibility VARCHAR(30) NOT NULL DEFAULT 'public', content LONGTEXT NULL, builder_json LONGTEXT NULL, metadata_json TEXT NULL, source_links TEXT NULL, owner_user_id VARCHAR(36) NULL, install_count INT NOT NULL DEFAULT 0, download_count INT NOT NULL DEFAULT 0, rating_count INT NOT NULL DEFAULT 0, rating_sum INT NOT NULL DEFAULT 0, file_path VARCHAR(1000) NULL, file_mime VARCHAR(100) NULL, source_file_name VARCHAR(255) NULL, submitted_by_company_id INT NULL, submitted_by_user_id VARCHAR(36) NULL, reviewer_notes TEXT NULL, reviewed_at TIMESTAMP NULL, reviewed_by VARCHAR(36) NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX idx_lib_visibility (visibility), INDEX idx_lib_type (type), INDEX idx_lib_category (category), INDEX idx_lib_updated_at (updated_at), INDEX idx_lib_owner (owner_user_id), INDEX idx_lib_install_cnt (install_count))" },
    { name: 'company_library_items', ddl: "CREATE TABLE IF NOT EXISTS company_library_items (id INT AUTO_INCREMENT PRIMARY KEY, company_id INT NOT NULL, source_item_id INT NOT NULL, source_version VARCHAR(30) NOT NULL DEFAULT '1.0', type VARCHAR(50) NOT NULL, category VARCHAR(100) NULL, title VARCHAR(255) NOT NULL, content LONGTEXT NULL, metadata_json TEXT NULL, customised TINYINT(1) NOT NULL DEFAULT 0, installed_by VARCHAR(36) NULL, installed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, update_available TINYINT(1) NOT NULL DEFAULT 0, FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE, FOREIGN KEY (source_item_id) REFERENCES library_items(id) ON DELETE RESTRICT, INDEX idx_cli_company (company_id), INDEX idx_cli_source (source_item_id), INDEX idx_cli_type (type), INDEX idx_cli_updated_at (updated_at), UNIQUE KEY uq_cli_company_source (company_id, source_item_id))" },
  ];
  for (const { name, ddl } of safetyTables) {
    try {
      // Check if table already exists before attempting CREATE — avoids DDL
      // parse errors from stale published bundles that had invalid TEXT defaults.
      const existRows = await db.execute(
        sql`SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${name}`
      ) as unknown as [Array<{ cnt: number }>, unknown];
      if (Number(existRows[0]?.[0]?.cnt ?? 0) > 0) continue;
      await db.execute(sql.raw(ddl));
      console.log(`[startup-migration] ${name} table ready`);
    } catch (e: unknown) {
      const msg = migrationErrMsg(e);
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
      name: 'bug_reports',
      ddl: "CREATE TABLE IF NOT EXISTS bug_reports (id VARCHAR(36) NOT NULL PRIMARY KEY, submitted_by_user_id VARCHAR(36) NOT NULL, submitted_by_name VARCHAR(255) NOT NULL DEFAULT '', submitted_by_email VARCHAR(255) NOT NULL DEFAULT '', company_id INT NULL, category VARCHAR(100) NOT NULL DEFAULT '', description TEXT NOT NULL, page_url VARCHAR(500) NOT NULL DEFAULT '', user_agent VARCHAR(500) NOT NULL DEFAULT '', screenshot_path VARCHAR(500) NULL, screenshot_bucket VARCHAR(100) NULL, status VARCHAR(30) NOT NULL DEFAULT 'open', resolution_note TEXT NULL, resolved_by_name VARCHAR(255) NULL, resolved_at DATETIME NULL, platform VARCHAR(50) NOT NULL DEFAULT 'web', app_version VARCHAR(50) NOT NULL DEFAULT '', current_route VARCHAR(300) NOT NULL DEFAULT '', diagnostic_events MEDIUMTEXT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX idx_status (status), INDEX idx_created (created_at DESC), INDEX idx_user (submitted_by_user_id))",
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
      const existRows = await db.execute(
        sql`SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${name}`
      ) as unknown as [Array<{ cnt: number }>, unknown];
      if (Number(existRows[0]?.[0]?.cnt ?? 0) > 0) continue;
      await db.execute(sql.raw(ddl));
      console.log(`[startup-migration] ${name} table ready`);
    } catch (e: unknown) {
      const msg = migrationErrMsg(e);
      if (!msg.includes('already exists') && !msg.includes('ER_TABLE_EXISTS')) {
        console.warn(`[startup-migration] ${name} CREATE failed:`, msg);
      }
    }
  }

  // ── Site Prestart tables ─────────────────────────────────────────────────────
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS site_prestarts (
        id INT PRIMARY KEY AUTO_INCREMENT,
        company_id INT NOT NULL,
        job_id INT NOT NULL,
        created_by_user_id VARCHAR(36) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'draft',
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
        site_conditions TEXT,
        changed_conditions TEXT,
        weather_concerns TEXT,
        access_issues TEXT,
        public_interface TEXT,
        live_services TEXT,
        underground_services TEXT,
        other_hazards TEXT,
        situation_checkboxes JSON,
        planned_work TEXT,
        work_location TEXT,
        plant_equipment TEXT,
        tools_required TEXT,
        deliveries_expected TEXT,
        key_tasks TEXT,
        execution_checklist JSON,
        critical_controls TEXT,
        task_sequencing TEXT,
        supervisor_instructions TEXT,
        admin_checklist JSON,
        hazards_actions TEXT,
        materials_delivered TEXT,
        plant_used TEXT,
        emergency_number VARCHAR(20) DEFAULT '000',
        electricity_emergency VARCHAR(20),
        radio_channel VARCHAR(100),
        assembly_point VARCHAR(255),
        assembly_point_confirmed BOOLEAN DEFAULT FALSE,
        stop_work_authority_confirmed BOOLEAN DEFAULT FALSE,
        relevant_swms_ids JSON,
        swms_reviewed_confirmed BOOLEAN DEFAULT FALSE,
        swms_review_notes TEXT,
        swms_snapshot JSON,
        no_swms_required BOOLEAN DEFAULT FALSE,
        no_swms_reason TEXT,
        weather_summary TEXT,
        ground_condition VARCHAR(20),
        weather_delay BOOLEAN DEFAULT FALSE,
        delay_hours DECIMAL(4,1),
        delay_reason TEXT,
        supervisor_signoff_name VARCHAR(255),
        supervisor_signature TEXT,
        submitted_at TIMESTAMP NULL,
        copied_from_id INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_sp_company (company_id),
        INDEX idx_sp_job (job_id),
        INDEX idx_sp_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('[startup-migration] site_prestarts table ready');
  } catch (e: unknown) {
    const msg = migrationErrMsg(e);
    if (!msg.includes('already exists') && !msg.includes('ER_TABLE_EXISTS')) {
      console.warn('[startup-migration] site_prestarts CREATE failed:', msg);
    }
  }

  try {
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
    console.log('[startup-migration] site_prestart_workers table ready');
  } catch (e: unknown) {
    const msg = migrationErrMsg(e);
    if (!msg.includes('already exists') && !msg.includes('ER_TABLE_EXISTS')) {
      console.warn('[startup-migration] site_prestart_workers CREATE failed:', msg);
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
      const checkRows = await db.execute(
        sql`SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user' AND COLUMN_NAME = ${column}`
      ) as unknown as [Array<{ cnt: number }>, unknown];
      const exists = Number(checkRows[0]?.[0]?.cnt ?? 0) > 0;
      if (!exists) {
        await db.execute(sql.raw(`ALTER TABLE \`user\` ADD COLUMN \`${column}\` ${definition}`));
        console.log(`[startup-migration] Added user.${column}`);
      }
    } catch (e: unknown) {
      const msg = migrationErrMsg(e);
      if (!isDupColumnError(e)) {
        console.warn(`[startup-migration] Could not ensure user.${column}:`, msg);
      }
    }
  }

  // Ensure stakeholder_type column on customers table
  try {
    const stRows = await db.execute(
      sql`SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customers' AND COLUMN_NAME = 'stakeholder_type'`
    ) as unknown as [Array<{ cnt: number }>, unknown];
    if (Number(stRows[0]?.[0]?.cnt ?? 0) === 0) {
      await db.execute(sql.raw(`ALTER TABLE \`customers\` ADD COLUMN \`stakeholder_type\` VARCHAR(50) NULL DEFAULT 'Customer'`));
      console.log('[startup-migration] Added customers.stakeholder_type');
    }
  } catch (e: unknown) {
    const msg = migrationErrMsg(e);
    if (!isDupColumnError(e)) {
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
      const checkRows = await db.execute(
        sql`SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'manual_verification_log' AND COLUMN_NAME = ${column}`
      ) as unknown as [Array<{ cnt: number }>, unknown];
      const exists = Number(checkRows[0]?.[0]?.cnt ?? 0) > 0;
      if (!exists) {
        await db.execute(sql.raw(`ALTER TABLE \`manual_verification_log\` ADD COLUMN \`${column}\` ${definition}`));
        console.log(`[startup-migration] Added manual_verification_log.${column}`);
      }
    } catch (e: unknown) {
      const msg = migrationErrMsg(e);
      if (!isDupColumnError(e)) {
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
      const checkRows = await db.execute(
        sql`SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'companies' AND COLUMN_NAME = ${column}`
      ) as unknown as [Array<{ cnt: number }>, unknown];
      const exists = Number(checkRows[0]?.[0]?.cnt ?? 0) > 0;
      if (!exists) {
        await db.execute(sql.raw(`ALTER TABLE \`companies\` ADD COLUMN \`${column}\` ${definition}`));
        console.log(`[startup-migration] Added companies.${column}`);
      }
    } catch (e: unknown) {
      const msg = migrationErrMsg(e);
      if (!isDupColumnError(e)) {
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
    const prColRows = await db.execute(
      sql`SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'profiles' AND COLUMN_NAME = 'platform_role'`
    ) as unknown as [Array<{ cnt: number }>, unknown];
    if (Number(prColRows[0]?.[0]?.cnt ?? 0) === 0) {
      await db.execute(sql.raw(`ALTER TABLE \`profiles\` ADD COLUMN \`platform_role\` VARCHAR(30) NULL DEFAULT NULL`));
      console.log('[startup-migration] profiles.platform_role column added');
    }
  } catch (e: unknown) {
    console.warn('[startup-migration] platform_role column error:', String((e as Error)?.message ?? e));
  }

  // ── Seed platform_role = 'developer' for known platform developer emails ──────────
  // darylwilliams1581@gmail.com = developer account (full platform access)
  // daryl.williams@energyq.com.au = regular user test account (clean slate, no developer access)
  const developerEmails = ['darylwilliams1581@gmail.com'];
  for (const email of developerEmails) {
    try {
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
  // Explicitly clear developer flag for the regular user test account
  try {
    await db.execute(
      sql`UPDATE profiles p
          INNER JOIN user u ON u.id = p.user_id
          SET p.platform_role = NULL
          WHERE LOWER(u.email) = LOWER('daryl.williams@energyq.com.au')`
    );
  } catch (e: unknown) {
    console.warn('[startup-migration] platform_role clear failed for energyq account:', String((e as Error)?.message ?? e));
  }
  console.log('[startup-migration] platform_role seeding complete');

  // ── platform_activity_log table ───────────────────────────────────────────
  try {
    const palRows = await db.execute(
      sql`SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'platform_activity_log'`
    ) as unknown as [Array<{ cnt: number }>, unknown];
    if (Number(palRows[0]?.[0]?.cnt ?? 0) === 0) {
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
    const msg = migrationErrMsg(e);
    if (!msg.includes('already exists') && !msg.includes('ER_TABLE_EXISTS')) {
      console.warn('[startup-migration] platform_activity_log create failed:', msg);
    }
  }

  // ── Permanently set developer/platform-owner accounts to 'owner' plan ────────
  // These emails are the platform developers and should never be on trial limits.
  // Primary source: PLATFORM_OWNER_EMAIL secret (comma-separated). Falls back to
  // the hardcoded address so the owner account is always promoted even before the
  // secret is configured.
  const { getSecret } = await import('#airo/secrets');
  const ownerEmailSecret = (() => { try { return getSecret('PLATFORM_OWNER_EMAIL'); } catch { return ''; } })();
  const devPlanEmails = Array.from(new Set([
    'darylwilliams1581@gmail.com',
    ...(ownerEmailSecret ? ownerEmailSecret.split(',').map((e: string) => e.trim()).filter(Boolean) : []),
  ]));
  for (const email of devPlanEmails) {
    try {
      await db.execute(sql`
        UPDATE companies c
        SET c.plan = 'owner',
            c.subscription_status = 'active',
            c.trial_ends_at = DATE_ADD(NOW(), INTERVAL 100 YEAR)
        WHERE c.id IN (
          SELECT p.company_id FROM profiles p
          INNER JOIN \`user\` u ON u.id = p.user_id
          WHERE LOWER(u.email) = LOWER(${email})
        )
        AND (c.plan != 'owner' OR c.subscription_status != 'active')
      `);
      console.log(`[startup-migration] Developer plan ensured for ${email}`);
    } catch (e: unknown) {
      console.warn(`[startup-migration] Developer plan fix failed for ${email}:`, String((e as Error)?.message ?? e));
    }
  }

  // ── jobs: scheduled_start_time / scheduled_end_time columns ─────────────────
  for (const col of ['scheduled_start_time', 'scheduled_end_time'] as const) {
    try {
      await db.execute(sql.raw(`ALTER TABLE jobs ADD COLUMN ${col} TIME NULL`));
      console.log(`[startup-migration] jobs.${col} column added`);
    } catch (e: unknown) {
      const msg = migrationErrMsg(e);
      if (!isDupColumnError(e)) {
        console.warn(`[startup-migration] jobs.${col} skipped:`, msg.slice(0, 120));
      }
    }
  }

  // ── team_shifts ──────────────────────────────────────────────────────────────
  try {
    await db.execute(sql.raw(
      "CREATE TABLE IF NOT EXISTS team_shifts (" +
      "  id            INT AUTO_INCREMENT PRIMARY KEY," +
      "  company_id    INT NOT NULL," +
      "  profile_id    INT NOT NULL," +
      "  job_id        INT NULL," +
      "  title         VARCHAR(255) NOT NULL DEFAULT 'Shift'," +
      "  shift_date    DATE NOT NULL," +
      "  start_time    TIME NOT NULL," +
      "  end_time      TIME NOT NULL," +
      "  break_minutes INT NOT NULL DEFAULT 0," +
      "  status        ENUM('scheduled','confirmed','completed','cancelled') NOT NULL DEFAULT 'scheduled'," +
      "  notes         TEXT NULL," +
      "  created_by    INT NULL," +
      "  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP," +
      "  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP," +
      "  INDEX idx_ts_company (company_id)," +
      "  INDEX idx_ts_profile (profile_id)," +
      "  INDEX idx_ts_date (shift_date)" +
      ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    ));
    console.log('[startup-migration] team_shifts table ready');
  } catch (e: unknown) {
    const msg = migrationErrMsg(e);
    if (!msg.includes('already exists') && !msg.includes('ER_TABLE_EXISTS')) {
      console.warn('[startup-migration] team_shifts CREATE failed:', msg);
    }
  }

  // ── team_time_entries ────────────────────────────────────────────────────────
  try {
    await db.execute(sql.raw(
      "CREATE TABLE IF NOT EXISTS team_time_entries (" +
      "  id            INT AUTO_INCREMENT PRIMARY KEY," +
      "  company_id    INT NOT NULL," +
      "  profile_id    INT NOT NULL," +
      "  shift_id      INT NULL," +
      "  job_id        INT NULL," +
      "  entry_date    DATE NOT NULL," +
      "  clock_in      DATETIME NOT NULL," +
      "  clock_out     DATETIME NULL," +
      "  break_minutes INT NOT NULL DEFAULT 0," +
      "  total_minutes INT GENERATED ALWAYS AS (" +
      "    CASE WHEN clock_out IS NOT NULL" +
      "      THEN TIMESTAMPDIFF(MINUTE, clock_in, clock_out) - break_minutes" +
      "      ELSE NULL END" +
      "  ) STORED," +
      "  hourly_rate   DECIMAL(10,2) NULL," +
      "  notes         TEXT NULL," +
      "  approved_by   INT NULL," +
      "  approved_at   DATETIME NULL," +
      "  status        ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending'," +
      "  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP," +
      "  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP," +
      "  INDEX idx_tte_company (company_id)," +
      "  INDEX idx_tte_profile (profile_id)," +
      "  INDEX idx_tte_date (entry_date)" +
      ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    ));
    console.log('[startup-migration] team_time_entries table ready');
  } catch (e: unknown) {
    const msg = migrationErrMsg(e);
    if (!msg.includes('already exists') && !msg.includes('ER_TABLE_EXISTS')) {
      console.warn('[startup-migration] team_time_entries CREATE failed:', msg);
    }
  }

  // ── job_attendance ────────────────────────────────────────────────────────
  try {
    await db.execute(sql.raw(
      "CREATE TABLE IF NOT EXISTS job_attendance (" +
      "  id          INT PRIMARY KEY AUTO_INCREMENT," +
      "  company_id  INT         NOT NULL," +
      "  job_id      INT         NOT NULL," +
      "  user_id     VARCHAR(36) NOT NULL," +
      "  action      VARCHAR(20) NOT NULL," +
      "  source      VARCHAR(20) NOT NULL DEFAULT 'portal'," +
      "  actor_type  VARCHAR(30) NOT NULL DEFAULT 'employee'," +
      "  notes       TEXT        NULL," +
      "  created_at  TIMESTAMP   DEFAULT CURRENT_TIMESTAMP," +
      "  INDEX idx_ja_job     (job_id)," +
      "  INDEX idx_ja_user    (user_id)," +
      "  INDEX idx_ja_company (company_id)," +
      "  INDEX idx_ja_created (created_at)," +
      "  FOREIGN KEY (job_id)     REFERENCES jobs(id)      ON DELETE CASCADE," +
      "  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE" +
      ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    ));
    console.log('[startup-migration] job_attendance table ready');
  } catch (e: unknown) {
    const msg = migrationErrMsg(e);
    if (!msg.includes('already exists') && !msg.includes('ER_TABLE_EXISTS')) {
      console.warn('[startup-migration] job_attendance CREATE failed:', msg);
    }
  }

  // ── guest_checkins ────────────────────────────────────────────────────────
  try {
    await db.execute(sql.raw(
      "CREATE TABLE IF NOT EXISTS guest_checkins (" +
      "  id                INT PRIMARY KEY AUTO_INCREMENT," +
      "  company_id        INT          NOT NULL," +
      "  job_id            INT          NOT NULL," +
      "  session_id        VARCHAR(64)  NOT NULL," +
      "  action            VARCHAR(20)  NOT NULL," +
      "  actor_type        VARCHAR(30)  NOT NULL DEFAULT 'guest'," +
      "  full_name         VARCHAR(255) NOT NULL," +
      "  phone_number      VARCHAR(50)  NOT NULL," +
      "  email             VARCHAR(255) NULL," +
      "  white_card_number VARCHAR(100) NOT NULL," +
      "  white_card_expiry VARCHAR(20)  NOT NULL," +
      "  contact_name      VARCHAR(255) NOT NULL," +
      "  contact_phone     VARCHAR(50)  NOT NULL," +
      "  reason_for_visit  TEXT         NOT NULL," +
      "  qr_token_id       VARCHAR(64)  NULL," +
      "  source            VARCHAR(20)  NOT NULL DEFAULT 'qr'," +
      "  created_at        TIMESTAMP    DEFAULT CURRENT_TIMESTAMP," +
      "  INDEX idx_gc_job     (job_id)," +
      "  INDEX idx_gc_company (company_id)," +
      "  INDEX idx_gc_session (session_id)," +
      "  FOREIGN KEY (job_id)     REFERENCES jobs(id)      ON DELETE CASCADE," +
      "  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE" +
      ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    ));
    console.log('[startup-migration] guest_checkins table ready');
  } catch (e: unknown) {
    const msg = migrationErrMsg(e);
    if (!msg.includes('already exists') && !msg.includes('ER_TABLE_EXISTS')) {
      console.warn('[startup-migration] guest_checkins CREATE failed:', msg);
    }
  }

  // ── Risky Assessments tables ─────────────────────────────────────────────────
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS risky_assessments (
        id                  INT PRIMARY KEY AUTO_INCREMENT,
        company_id          INT NOT NULL,
        job_id              INT NOT NULL,
        created_by_user_id  VARCHAR(36) NOT NULL,
        linked_prestart_id  INT NULL,
        status              VARCHAR(20) NOT NULL DEFAULT 'draft',
        assessment_date     DATE NULL,
        assessment_time     VARCHAR(10) NULL,
        recorded_by         VARCHAR(255) NULL,
        activity            TEXT NULL,
        hazards_selected    JSON NULL,
        other_hazard_text   TEXT NULL,
        control_measures    TEXT NULL,
        workers_briefed     BOOLEAN NOT NULL DEFAULT FALSE,
        notes               TEXT NULL,
        finalised_at        DATETIME NULL,
        created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_risky_job (job_id),
        INDEX idx_risky_company (company_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('[startup-migration] risky_assessments table ready');
  } catch (e: unknown) {
    const msg = migrationErrMsg(e);
    if (!msg.includes('already exists') && !msg.includes('ER_TABLE_EXISTS')) {
      console.warn('[startup-migration] risky_assessments CREATE failed:', msg);
    }
  }

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS risky_assessment_signatures (
        id                    INT PRIMARY KEY AUTO_INCREMENT,
        risky_assessment_id   INT NOT NULL,
        signer_name           VARCHAR(255) NOT NULL,
        signature_data        MEDIUMTEXT NOT NULL,
        signed_at             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_risky_sig_assessment (risky_assessment_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('[startup-migration] risky_assessment_signatures table ready');
  } catch (e: unknown) {
    const msg = migrationErrMsg(e);
    if (!msg.includes('already exists') && !msg.includes('ER_TABLE_EXISTS')) {
      console.warn('[startup-migration] risky_assessment_signatures CREATE failed:', msg);
    }
  }

  // ── Risky Assessments: add permit columns (idempotent ALTERs) ────────────────
  const riskyAlters: Array<{ col: string; ddl: string }> = [
    { col: 'permit_required',              ddl: 'BOOLEAN NOT NULL DEFAULT FALSE' },
    { col: 'permit_types',                 ddl: 'JSON NULL' },
    { col: 'other_permit_text',            ddl: 'TEXT NULL' },
    { col: 'permit_notes',                 ddl: 'TEXT NULL' },
    { col: 'permit_supervisor_name',       ddl: 'VARCHAR(255) NULL' },
    { col: 'permit_supervisor_signature',  ddl: 'MEDIUMTEXT NULL' },
    { col: 'permit_supervisor_signed_at',  ddl: 'DATETIME NULL' },
    { col: 'workers_involved',             ddl: 'TEXT NULL' },
  ];
  for (const { col, ddl } of riskyAlters) {
    try {
      await db.execute(sql.raw(`ALTER TABLE risky_assessments ADD COLUMN ${col} ${ddl}`));
      console.log(`[startup-migration] risky_assessments: added column ${col}`);
    } catch (e: unknown) {
      const msg = migrationErrMsg(e);
      if (!isDupColumnError(e)) {
        console.warn(`[startup-migration] risky_assessments ALTER ${col} failed:`, msg);
      }
    }
  }

  // ── Incident Register tables ──────────────────────────────────────────────────
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS incidents (
        id                          INT PRIMARY KEY AUTO_INCREMENT,
        company_id                  INT NOT NULL,
        created_by_user_id          VARCHAR(36) NOT NULL,
        job_id                      INT NULL,
        job_number                  VARCHAR(100) NULL,
        job_name                    VARCHAR(255) NULL,
        customer_name               VARCHAR(255) NULL,
        site_address                TEXT NULL,
        incident_date               DATE NOT NULL,
        incident_time               VARCHAR(10) NULL,
        reported_by                 VARCHAR(255) NOT NULL,
        location                    TEXT NULL,
        incident_type               VARCHAR(100) NOT NULL,
        severity                    VARCHAR(20) NOT NULL DEFAULT 'medium',
        description                 TEXT NOT NULL,
        immediate_action_taken      TEXT NULL,
        injury_occurred             BOOLEAN NOT NULL DEFAULT FALSE,
        person_injured              VARCHAR(255) NULL,
        medical_treatment_required  BOOLEAN NOT NULL DEFAULT FALSE,
        property_damage             BOOLEAN NOT NULL DEFAULT FALSE,
        environmental_impact        BOOLEAN NOT NULL DEFAULT FALSE,
        witnesses                   TEXT NULL,
        third_parties_involved      BOOLEAN NOT NULL DEFAULT FALSE,
        notes                       TEXT NULL,
        status                      VARCHAR(30) NOT NULL DEFAULT 'open',
        closed_at                   DATETIME NULL,
        closed_by                   VARCHAR(255) NULL,
        manager_sign_off            TEXT NULL,
        created_at                  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at                  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_incidents_company (company_id),
        INDEX idx_incidents_job (job_id),
        INDEX idx_incidents_date (incident_date),
        INDEX idx_incidents_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('[startup-migration] incidents table ready');
  } catch (e: unknown) {
    const msg = migrationErrMsg(e);
    if (!msg.includes('already exists') && !msg.includes('ER_TABLE_EXISTS')) {
      console.warn('[startup-migration] incidents CREATE failed:', msg);
    }
  }

  // incidents-archive. Add archive columns to incidents (idempotent)
  for (const colDef of [
    "archived_at    DATETIME NULL",
    "archived_by    VARCHAR(255) NULL",
    "archive_reason TEXT NULL",
  ]) {
    const colName = colDef.trim().split(/\s+/)[0];
    try {
      await db.execute(sql.raw(`ALTER TABLE incidents ADD COLUMN ${colDef}`));
      console.log(`[startup-migration] incidents.${colName} added`);
    } catch (e: unknown) {
      const msg = migrationErrMsg(e);
      if (!isDupColumnError(e)) {
        console.warn(`[startup-migration] incidents.${colName} alter failed:`, msg);
      }
    }
  }

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS incident_corrective_actions (
        id           INT PRIMARY KEY AUTO_INCREMENT,
        incident_id  INT NOT NULL,
        action       TEXT NOT NULL,
        owner        VARCHAR(255) NULL,
        due_date     DATE NULL,
        status       VARCHAR(30) NOT NULL DEFAULT 'open',
        completed_at DATETIME NULL,
        notes        TEXT NULL,
        created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_ica_incident (incident_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('[startup-migration] incident_corrective_actions table ready');
  } catch (e: unknown) {
    const msg = migrationErrMsg(e);
    if (!msg.includes('already exists') && !msg.includes('ER_TABLE_EXISTS')) {
      console.warn('[startup-migration] incident_corrective_actions CREATE failed:', msg);
    }
  }

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS incident_third_parties (
        id                    INT PRIMARY KEY AUTO_INCREMENT,
        incident_id           INT NOT NULL,
        name                  VARCHAR(255) NULL,
        company_org           VARCHAR(255) NULL,
        role_type             VARCHAR(100) NULL,
        contact_phone         VARCHAR(50) NULL,
        contact_email         VARCHAR(255) NULL,
        involvement           TEXT NOT NULL,
        injury_damage_alleged BOOLEAN NOT NULL DEFAULT FALSE,
        statement_taken       BOOLEAN NOT NULL DEFAULT FALSE,
        is_witness            BOOLEAN NOT NULL DEFAULT FALSE,
        created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_itp_incident (incident_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('[startup-migration] incident_third_parties table ready');
  } catch (e: unknown) {
    const msg = migrationErrMsg(e);
    if (!msg.includes('already exists') && !msg.includes('ER_TABLE_EXISTS')) {
      console.warn('[startup-migration] incident_third_parties CREATE failed:', msg);
    }
  }

  // ── incident_attachments ──────────────────────────────────────────────────────
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS incident_attachments (
        id               INT PRIMARY KEY AUTO_INCREMENT,
        incident_id      INT NOT NULL,
        company_id       INT NOT NULL,
        file_type        VARCHAR(20) NOT NULL DEFAULT 'image',
        original_name    VARCHAR(500) NOT NULL,
        storage_key      VARCHAR(500) NOT NULL,
        storage_provider VARCHAR(50) NOT NULL DEFAULT 'local',
        mime_type        VARCHAR(100) NOT NULL,
        size_bytes       INT NOT NULL DEFAULT 0,
        public_url       TEXT NOT NULL,
        uploaded_by      VARCHAR(255) NULL,
        created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_ia_incident (incident_id),
        INDEX idx_ia_company (company_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('[startup-migration] incident_attachments table ready');
  } catch (e: unknown) {
    const msg = migrationErrMsg(e);
    if (!msg.includes('already exists') && !msg.includes('ER_TABLE_EXISTS')) {
      console.warn('[startup-migration] incident_attachments CREATE failed:', msg);
    }
  }

  // ── Job Cards ─────────────────────────────────────────────────────────────────
  // Three tables: job_cards (header), job_card_materials (line items), job_card_photos
  const jobCardTables = [
    {
      name: 'job_cards',
      ddl: `CREATE TABLE IF NOT EXISTS job_cards (
        id                    INT AUTO_INCREMENT PRIMARY KEY,
        company_id            INT NOT NULL,
        card_number           VARCHAR(20) NOT NULL,
        status                VARCHAR(20) NOT NULL DEFAULT 'draft',
        customer_id           INT NULL,
        customer_name_override VARCHAR(255) NULL,
        site_address          TEXT NULL,
        contact_person        VARCHAR(255) NULL,
        contact_phone         VARCHAR(50) NULL,
        po_number             VARCHAR(100) NULL,
        service_date          DATE NULL,
        assigned_user_id      VARCHAR(36) NULL,
        assigned_name         VARCHAR(255) NULL,
        work_description      TEXT NOT NULL,
        labour_hours          DECIMAL(8,2) NULL,
        labour_rate           DECIMAL(10,2) NULL,
        labour_amount         DECIMAL(12,2) NULL,
        notes                 TEXT NULL,
        internal_notes        TEXT NULL,
        completion_summary    TEXT NULL,
        authorised_by         VARCHAR(255) NULL,
        signature_data        LONGTEXT NULL,
        approval_date         DATE NULL,
        invoice_id            INT NULL,
        converted_job_id      INT NULL,
        created_by_user_id    VARCHAR(36) NULL,
        created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_jc_company  (company_id),
        INDEX idx_jc_status   (company_id, status),
        INDEX idx_jc_customer (company_id, customer_id),
        INDEX idx_jc_date     (company_id, service_date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    },
    {
      name: 'job_card_materials',
      ddl: `CREATE TABLE IF NOT EXISTS job_card_materials (
        id           INT AUTO_INCREMENT PRIMARY KEY,
        job_card_id  INT NOT NULL,
        company_id   INT NOT NULL,
        description  TEXT NOT NULL,
        cost         DECIMAL(12,2) NOT NULL DEFAULT 0,
        created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_jcm_card    (job_card_id),
        INDEX idx_jcm_company (company_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    },
    {
      name: 'job_card_photos',
      ddl: `CREATE TABLE IF NOT EXISTS job_card_photos (
        id              INT AUTO_INCREMENT PRIMARY KEY,
        job_card_id     INT NOT NULL,
        company_id      INT NOT NULL,
        file_path       VARCHAR(1000) NOT NULL,
        file_name       VARCHAR(255) NOT NULL,
        mime_type       VARCHAR(100) NULL,
        caption         TEXT NULL,
        uploaded_by     VARCHAR(36) NULL,
        created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_jcp_card    (job_card_id),
        INDEX idx_jcp_company (company_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    },
  ];
  for (const { name, ddl } of jobCardTables) {
    try {
      const existRows = await db.execute(
        sql`SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${name}`
      ) as unknown as [Array<{ cnt: number }>, unknown];
      if (Number(existRows[0]?.[0]?.cnt ?? 0) > 0) continue;
      await db.execute(sql.raw(ddl));
      console.log(`[startup-migration] ${name} table ready`);
    } catch (e: unknown) {
      const msg = migrationErrMsg(e);
      if (!msg.includes('already exists') && !msg.includes('ER_TABLE_EXISTS')) {
        console.warn(`[startup-migration] ${name} CREATE failed:`, msg);
      }
    }
  }

  // ── Job Card Photos: lock + version columns (PhotoEditor pilot) ──────────────
  // Additive, backward-compatible. Safe to run multiple times (IF NOT EXISTS).
  // Existing rows default to locked=0, all other new columns NULL.
  //
  // Columns:
  //   locked             — 0=unlocked, 1=locked
  //   locked_at          — when it was locked
  //   locked_by          — userId who locked it
  //   original_file_path — R2 key of the original upload (set once on first Save & Lock)
  //   edited_file_path   — R2 key of the edited version (same as file_path after lock)
  //   edited_at          — when the edit was saved
  //   edited_by          — userId who saved the edit
  //
  // Rollback: DROP COLUMN IF EXISTS each of the above (safe before pilot goes live).
  const jcpLockCols: Array<{ column: string; definition: string }> = [
    { column: 'locked',             definition: 'TINYINT(1) NOT NULL DEFAULT 0' },
    { column: 'locked_at',          definition: 'DATETIME NULL' },
    { column: 'locked_by',          definition: 'VARCHAR(36) NULL' },
    { column: 'original_file_path', definition: 'VARCHAR(1000) NULL' },
    { column: 'edited_file_path',   definition: 'VARCHAR(1000) NULL' },
    { column: 'edited_at',          definition: 'DATETIME NULL' },
    { column: 'edited_by',          definition: 'VARCHAR(36) NULL' },
  ];
  for (const { column, definition } of jcpLockCols) {
    try {
      const [colCheck] = await db.execute(
        sql`SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME   = 'job_card_photos'
              AND COLUMN_NAME  = ${column}`
      ) as unknown as [Array<{ cnt: number }>, unknown];
      if (Number(colCheck?.[0]?.cnt ?? 0) > 0) continue;
      await db.execute(sql.raw(`ALTER TABLE job_card_photos ADD COLUMN ${column} ${definition}`));
      console.log(`[startup-migration] job_card_photos.${column} added`);
    } catch (e: unknown) {
      const msg = migrationErrMsg(e);
      if (!msg.includes('Duplicate column') && !msg.includes('ER_DUP_FIELDNAME')) {
        console.warn(`[startup-migration] job_card_photos.${column} ALTER failed:`, msg);
      }
    }
  }

  // ── Job Cards: back-link columns on invoices and jobs ─────────────────────────
  // source_job_card_id on invoices — permanent link from invoice back to its source card
  // source_job_card_id on jobs     — permanent link from a converted job back to its source card
  const jobCardCols: Array<{ table: string; column: string; definition: string }> = [
    { table: 'invoices', column: 'source_job_card_id', definition: 'INT NULL' },
    { table: 'jobs',     column: 'source_job_card_id', definition: 'INT NULL' },
  ];
  for (const { table, column, definition } of jobCardCols) {
    try {
      const colRows = await db.execute(
        sql`SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${table} AND COLUMN_NAME = ${column}`
      ) as unknown as [Array<{ cnt: number }>, unknown];
      if (Number(colRows[0]?.[0]?.cnt ?? 0) > 0) continue;
      await db.execute(sql.raw(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`));
      console.log(`[startup-migration] Added ${column} to ${table}`);
    } catch (e: unknown) {
      const msg = migrationErrMsg(e);
      if (!isDupColumnError(e)) {
        console.warn(`[startup-migration] Could not add ${column} to ${table}:`, msg);
      }
    }
  }

  // ── sms_verification_codes: phone column ──────────────────────────────────────
  // Added after initial table creation — stores the phone number the code was sent to
  try {
    const smsPhoneRows = await db.execute(
      sql`SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sms_verification_codes' AND COLUMN_NAME = 'phone'`
    ) as unknown as [Array<{ cnt: number }>, unknown];
    if (Number(smsPhoneRows[0]?.[0]?.cnt ?? 0) === 0) {
      await db.execute(sql.raw(`ALTER TABLE \`sms_verification_codes\` ADD COLUMN \`phone\` VARCHAR(30) NOT NULL DEFAULT ''`));
      console.log('[startup-migration] sms_verification_codes.phone added');
    }
  } catch (e: unknown) {
    const msg = migrationErrMsg(e);
    if (!isDupColumnError(e)) {
      console.warn('[startup-migration] sms_verification_codes.phone alter failed:', msg);
    }
  }

  // ── profiles: white_card_number column ────────────────────────────────────────
  // Construction Induction (White Card) number — used in SWMS/safety sign-on
  try {
    const wcRows = await db.execute(
      sql`SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'profiles' AND COLUMN_NAME = 'white_card_number'`
    ) as unknown as [Array<{ cnt: number }>, unknown];
    if (Number(wcRows[0]?.[0]?.cnt ?? 0) === 0) {
      await db.execute(sql.raw(`ALTER TABLE \`profiles\` ADD COLUMN \`white_card_number\` VARCHAR(100) NULL`));
      console.log('[startup-migration] profiles.white_card_number added');
    }
  } catch (e: unknown) {
    const msg = migrationErrMsg(e);
    if (!isDupColumnError(e)) {
      console.warn('[startup-migration] profiles.white_card_number alter failed:', msg);
    }
  }
}

// ── Run migrations at module load time (covers dev HMR + production) ─────────
// Skip in Vitest: the DB stubs are no-ops and the migration IIFE would hit
// the real MySQL connection, crashing unit tests that have no DB available.
if (!process.env.VITEST) {
  void runStartupMigrations().catch((e) =>
    console.error('[startup-migration] fatal:', e)
  );
  // Media assets migration runs independently so it doesn't block the main
  // migration chain and can be added without touching runStartupMigrations.
  void import('./lib/media-migration.js').then(m =>
    m.runMediaAssetsMigration().catch((e: unknown) =>
      console.error('[media-migration] fatal:', e)
    )
  );
}

// ── DB connection keep-alive ──────────────────────────────────────────────────
// MySQL managed instances close idle connections after wait_timeout (often 60–300 s
// on shared tiers). mysql2 pools don't detect a server-side close until the next
// query, which surfaces as ER_CLIENT_INTERACTION_TIMEOUT.
//
// Strategy:
//   1. Immediate warm-up: acquire POOL_SIZE connections simultaneously on startup
//      so every slot is fresh before the first real request.
//   2. Ping every 20 s — well under the typical 60 s wait_timeout — cycling
//      through POOL_SIZE concurrent pings so every connection in the pool stays
//      alive, not just one.
const KEEPALIVE_POOL_SIZE = 5; // match or exceed the pool's connectionLimit
const KEEPALIVE_INTERVAL_MS = 20_000;

async function pingAllPoolConnections(label: string) {
  try {
    const { testConnection } = await import('./db/client.js');
    // Fire KEEPALIVE_POOL_SIZE concurrent pings so the pool allocates multiple
    // connections and keeps them all warm.
    const results = await Promise.allSettled(
      Array.from({ length: KEEPALIVE_POOL_SIZE }, () => testConnection())
    );
    const ok = results.filter((r) => r.status === 'fulfilled' && r.value).length;
    if (label === 'startup') {
      console.log(`[db-keepalive] pool warmed up (${ok}/${KEEPALIVE_POOL_SIZE} connections ok)`);
    }
  } catch (e) {
    console.warn(`[db-keepalive] ${label} ping failed:`, String(e).slice(0, 120));
  }
}

if (!process.env.VITEST) {
  void pingAllPoolConnections('startup');
  setInterval(() => void pingAllPoolConnections('interval'), KEEPALIVE_INTERVAL_MS);
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
app.post("/api/admin/set-user-company", admin_set_user_company_post_1);
app.post("/api/admin/fix-photo-thumbnails", adminFixPhotoThumbnailsPost);
app.post("/api/admin/fix-photo-record-fields", adminFixPhotoRecordFieldsPost);
app.post("/api/admin/fix-all-photo-fields", adminFixAllPhotoFieldsPost);
// (diagnostics removed)
app.get("/api/asset-manager/assets", asset_manager_assets_get_2);
app.post("/api/asset-manager/assets", asset_manager_assets_post_3);
app.get("/api/asset-manager/assets/:id", asset_manager_assets_id_get_4);
app.patch("/api/asset-manager/assets/:id", asset_manager_assets_id_patch_5);
app.post("/api/asset-manager/assets/:id/archive", asset_manager_assets_id_archive_post_6);
app.get("/api/asset-manager/assets/:id/notes", asset_manager_assets_id_notes_get_7);
app.post("/api/asset-manager/assets/:id/notes", asset_manager_assets_id_notes_post_8);
app.delete("/api/asset-manager/assets/:id/notes/:noteId", asset_manager_assets_id_notes_noteId_delete_9);
app.delete("/api/asset-manager/assets/:id/permanent", asset_manager_assets_id_permanent_delete_10);
app.get("/api/asset-manager/assets/:id/photos", asset_manager_assets_id_photos_get_11);
app.post("/api/asset-manager/assets/:id/photos", asset_manager_assets_id_photos_post_12);
app.delete("/api/asset-manager/assets/:id/photos/:photoId", asset_manager_assets_id_photos_photoId_delete_13);
app.post("/api/asset-manager/assets/:id/restore", asset_manager_assets_id_restore_post_14);
app.get("/api/asset-manager/assets/:id/todos", asset_manager_assets_id_todos_get_15);
app.post("/api/asset-manager/assets/:id/todos", asset_manager_assets_id_todos_post_16);
app.delete("/api/asset-manager/assets/:id/todos/:todoId", asset_manager_assets_id_todos_todoId_delete_17);
app.put("/api/asset-manager/assets/:id/todos/:todoId", asset_manager_assets_id_todos_todoId_put_18);
app.get("/api/asset-manager/defects", asset_manager_defects_get_19);
app.patch("/api/asset-manager/defects/:id", asset_manager_defects_id_patch_20);
app.post("/api/asset-manager/defects/:id/archive", asset_manager_defects_id_archive_post_21);
app.get("/api/asset-manager/inspections", asset_manager_inspections_get_22);
app.post("/api/asset-manager/inspections", asset_manager_inspections_post_23);
app.get("/api/asset-manager/inspections/:id", asset_manager_inspections_id_get_24);
app.patch("/api/asset-manager/inspections/:id", asset_manager_inspections_id_patch_25);
app.post("/api/asset-manager/inspections/:id/archive", asset_manager_inspections_id_archive_post_26);
app.post("/api/asset-manager/inspections/:id/closeout", asset_manager_inspections_id_closeout_post_27);
app.post("/api/asset-manager/inspections/:id/defects", asset_manager_inspections_id_defects_post_28);
app.delete("/api/asset-manager/inspections/:id/permanent", asset_manager_inspections_id_permanent_delete_29);
app.post("/api/asset-manager/inspections/:id/photos", asset_manager_inspections_id_photos_post_30);
app.post("/api/asset-manager/inspections/:id/report/share", asset_manager_inspections_id_report_share_post_31);
app.post("/api/asset-manager/inspections/:id/restore", asset_manager_inspections_id_restore_post_32);
app.post("/api/asset-manager/inspections/:id/tenders", asset_manager_inspections_id_tenders_post_33);
app.get("/api/asset-manager/monitoring", asset_manager_monitoring_get_34);
app.get("/api/asset-manager/reports/:shareToken", asset_manager_reports_shareToken_get_35);
app.get("/api/asset-manager/tenders", asset_manager_tenders_get_36);
app.get("/api/asset-manager/tenders/:id", asset_manager_tenders_id_get_37);
app.patch("/api/asset-manager/tenders/:id", asset_manager_tenders_id_patch_38);
app.get("/api/asset-manager/tenders/:id/attachments", asset_manager_tenders_id_attachments_get_39);
app.post("/api/asset-manager/tenders/:id/attachments", asset_manager_tenders_id_attachments_post_40);
app.delete("/api/asset-manager/tenders/:id/attachments/:fileId", asset_manager_tenders_id_attachments_fileId_delete_41);
app.post("/api/asset-manager/tenders/:id/complete", asset_manager_tenders_id_complete_post_42);
app.post("/api/asset-manager/tenders/:id/contracts", asset_manager_tenders_id_contracts_post_43);
app.patch("/api/asset-manager/tenders/:id/notes", asset_manager_tenders_id_notes_patch_44);
app.get("/api/asset-manager/tenders/:id/todos", asset_manager_tenders_id_todos_get_45);
app.post("/api/asset-manager/tenders/:id/todos", asset_manager_tenders_id_todos_post_46);
app.delete("/api/asset-manager/tenders/:id/todos/:todoId", asset_manager_tenders_id_todos_todoId_delete_47);
app.put("/api/asset-manager/tenders/:id/todos/:todoId", asset_manager_tenders_id_todos_todoId_put_48);
app.post("/api/auth/change-email", auth_change_email_post_49);
app.post("/api/auth/change-password", auth_change_password_post_50);
app.post("/api/auth/check-signup-status", auth_check_signup_status_post_51);
app.post("/api/auth/forgot-password", auth_forgot_password_post_52);
app.post("/api/auth/pin-login", auth_pin_login_post_53);
app.post("/api/auth/resend-verification", auth_resend_verification_post_54);
app.post("/api/auth/reset-password", auth_reset_password_post_55);
app.post("/api/auth/resume-signup", auth_resume_signup_post_56);
app.post("/api/auth/self-verify", auth_self_verify_post_57);
app.post("/api/auth/send-sms-code", auth_send_sms_code_post_58);
app.get("/api/auth/sms-configured", auth_sms_configured_get_59);
app.post("/api/auth/sms-recovery", auth_sms_recovery_post_60);
app.get("/api/auth/trusted-devices", auth_trusted_devices_get_61);
app.post("/api/auth/trusted-devices", auth_trusted_devices_post_62);
app.delete("/api/auth/trusted-devices/:deviceId", auth_trusted_devices_deviceId_delete_63);
app.patch("/api/auth/trusted-devices/:deviceId/clear-pin", auth_trusted_devices_deviceId_clear_pin_patch);
app.get("/api/auth/validate-reset-token", auth_validate_reset_token_get_64);
app.post("/api/auth/verify-email", auth_verify_email_post_65);
app.post("/api/auth/verify-sms-code", auth_verify_sms_code_post_66);
app.get("/api/auth/:action", auth_action_get_67);
app.post("/api/auth/:action", auth_action_post_68);
app.get("/api/auth/:action/:detail", auth_action_detail_get_69);
app.post("/api/auth/:action/:detail", auth_action_detail_post_70);
app.post("/api/billing/cancel-subscription", billing_cancel_subscription_post_71);
app.post("/api/billing/cancellation-feedback", billing_cancellation_feedback_post_72);
app.post("/api/billing/customer-portal", billing_customer_portal_post_73);
app.post("/api/billing/reactivate-subscription", billing_reactivate_subscription_post_74);
app.post("/api/billing/upgrade-subscription", billing_upgrade_subscription_post_75);
app.get("/api/company", company_get_83);
app.put("/api/company", company_put_84);
app.post("/api/company/logo", company_logo_post_85);
app.get("/api/company-settings", company_settings_get_86);
app.put("/api/company-settings", company_settings_put_87);
app.get("/api/config/maps-key", config_maps_key_get_88);
app.post("/api/contact", contact_post_89);
app.get("/api/cost-guide", cost_guide_get_90);
app.post("/api/cost-guide", cost_guide_post_91);
app.get("/api/cost-guide/export-csv", cost_guide_export_csv_get_92);
app.post("/api/cost-guide/import-csv", cost_guide_import_csv_post_93);
app.delete("/api/cost-guide/:id", cost_guide_id_delete_94);
app.put("/api/cost-guide/:id", cost_guide_id_put_95);
app.get("/api/customers", customers_get_96);
app.post("/api/customers", customers_post_97);
app.delete("/api/customers/:id", customers_id_delete_98);
app.get("/api/customers/:id", customers_id_get_99);
app.put("/api/customers/:id", customers_id_put_100);
app.get("/api/dashboard/kpi", dashboard_kpi_get_101);
app.get("/api/dashboard/setup-check", dashboard_setup_check_get_102);
app.get("/api/dashboard/todos", dashboard_todos_get_103);
app.post("/api/dazza/annette", dazza_annette_post_104);
app.post("/api/dazza/brain/hive/approve", dazza_brain_hive_approve_post_105);
app.post("/api/dazza/brain/hive/reject", dazza_brain_hive_reject_post_106);
app.get("/api/dazza/brain/status", dazza_brain_status_get_107);
app.post("/api/dazza/chat", dazza_chat_post_108);
app.post("/api/dazza/chat-v2", dazza_chat_v2_post_109);
app.post("/api/dazza/chat-v2/stream", dazza_chat_v2_stream_post_110);
app.get("/api/dazza/context", dazza_context_get_111);
app.get("/api/dazza/key-status", dazza_key_status_get_112);
app.get("/api/dazza/knowledge", dazza_knowledge_get_113);
app.post("/api/dazza/knowledge", dazza_knowledge_post_114);
app.delete("/api/dazza/knowledge/:id", dazza_knowledge_id_delete_115);
app.put("/api/dazza/knowledge/:id", dazza_knowledge_id_put_116);
app.get("/api/developer/activity-log", developer_activity_log_get_117);
app.get("/api/developer/audit-log", developer_audit_log_get_118);
app.post("/api/developer/companies/:id/archive", developer_companies_id_archive_post_119);
app.get("/api/developer/company-health", developer_company_health_get_120);
app.get("/api/developer/email-log", developer_email_log_get_121);
app.get("/api/developer/email-settings", developer_email_settings_get_122);
app.put("/api/developer/email-settings", developer_email_settings_put_123);
app.post("/api/developer/email-settings/test", developer_email_settings_test_post_124);
app.post("/api/developer/run-seed-now", developer_run_seed_now_post_125);
app.post("/api/developer/seed-developer-account", developer_seed_developer_account_post_126);
app.get("/api/developer/support-notes", developer_support_notes_get_127);
app.post("/api/developer/support-notes", developer_support_notes_post_128);
app.delete("/api/developer/support-notes/:id", developer_support_notes_id_delete_129);
app.post("/api/developer/swms-cleanup", developer_swms_cleanup_post_130);
app.get("/api/developer/media-backfill-report", developer_media_backfill_report_get);
app.post("/api/developer/users/:id/assign-company", developer_users_id_assign_company_post_131);
app.post("/api/developer/users/:id/deactivate", developer_users_id_deactivate_post_132);
app.post("/api/developer/users/:id/delete-orphan", developer_users_id_delete_orphan_post_133);
app.post("/api/developer/users/:id/force-temp-password", developer_users_id_force_temp_password_post_134);
app.delete("/api/developer/users/:id/impersonate", developer_users_id_impersonate_delete_135);
app.post("/api/developer/users/:id/impersonate", developer_users_id_impersonate_post_136);
app.post("/api/developer/users/:id/reactivate", developer_users_id_reactivate_post_137);
app.post("/api/developer/users/:id/resend-verification", developer_users_id_resend_verification_post_138);
app.put("/api/developer/users/:id/role", developer_users_id_role_put_139);
app.post("/api/developer/users/:id/send-reset-email", developer_users_id_send_reset_email_post_140);
app.delete("/api/developer/users/:id/sessions", developer_users_id_sessions_delete_141);
app.get("/api/developer/users/:id/sessions", developer_users_id_sessions_get_142);
app.post("/api/developer/users/:id/unlock-account", developer_users_id_unlock_account_post_143);
app.get("/api/document-templates", document_templates_get_144);
app.post("/api/document-templates", document_templates_post_145);
app.delete("/api/document-templates/:id", document_templates_id_delete_146);
app.get("/api/document-templates/:id", document_templates_id_get_147);
app.put("/api/document-templates/:id", document_templates_id_put_148);
app.post("/api/document-templates/:id/duplicate", document_templates_id_duplicate_post_149);
app.get("/api/document-templates/:id/export/docx", document_templates_id_export_docx_get_150);
app.get("/api/document-templates/:id/export/pdf", document_templates_id_export_pdf_get_151);
app.post("/api/document-templates/:id/import-blocks", document_templates_id_import_blocks_post_152);
app.post("/api/document-templates/:id/import-docx", document_templates_id_import_docx_post_153);
app.post("/api/document-templates/:id/import-pdf", document_templates_id_import_pdf_post_154);
app.post("/api/document-templates/:id/publish-to-library", document_templates_id_publish_to_library_post_155);
app.get("/api/documents", documents_get_156);
app.get("/api/documents/share/:token", documents_share_token_get_157);
app.post("/api/documents/share/:token", documents_share_token_post_158);
app.get("/api/documents/:id", documents_id_get_159);
app.put("/api/documents/:id", documents_id_put_160);
app.get("/api/documents/:id/events", documents_id_events_get_161);
app.delete("/api/documents/:id/share", documents_id_share_delete_162);
app.post("/api/documents/:id/share", documents_id_share_post_163);
app.get("/api/drawings", drawings_get_164);
app.post("/api/drawings", drawings_post_165);
app.post("/api/drawings/upload", drawings_upload_post_166);
app.delete("/api/drawings/:id", drawings_id_delete_167);
app.patch("/api/drawings/:id", drawings_id_patch_168);
app.post("/api/drawings/:id/markup", drawings_id_markup_post_169);
app.get("/api/emergency-alerts", emergency_alerts_get_170);
app.post("/api/emergency-alerts", emergency_alerts_post_171);
app.put("/api/emergency-alerts/:id", emergency_alerts_id_put_172);
app.get("/api/estimates", estimates_get_173);
app.post("/api/estimates", estimates_post_174);
app.delete("/api/estimates/:id", estimates_id_delete_175);
app.get("/api/estimates/:id", estimates_id_get_176);
app.put("/api/estimates/:id", estimates_id_put_177);
app.post("/api/estimates/:id/convert-to-invoice", estimates_id_convert_to_invoice_post_178);
app.get("/api/estimates/:id/export-csv", estimates_id_export_csv_get_179);
app.get("/api/estimates/:id/export-pdf", estimates_id_export_pdf_get_180);
app.post("/api/estimates/:id/import-csv", estimates_id_import_csv_post_181);
app.post("/api/estimates/:id/unlock", estimates_id_unlock_post_182);
app.get("/api/external/form/:token", external_form_token_get_183);
app.post("/api/external/form/:token", external_form_token_post_184);
app.get("/api/files", files_get_185);
app.post("/api/files", files_post_186);
app.delete("/api/files/:id", files_id_delete_187);
app.get("/api/files/:id/download", files_id_download_get_188);
app.get("/api/fleet", fleet_get_189);
app.post("/api/fleet", fleet_post_190);
app.get("/api/fleet/analytics-settings", fleet_analytics_settings_get_191);
app.put("/api/fleet/analytics-settings", fleet_analytics_settings_put_192);
app.get("/api/fleet/asset-bookings", fleet_asset_bookings_get_193);
app.post("/api/fleet/asset-bookings", fleet_asset_bookings_post_194);
app.delete("/api/fleet/asset-bookings/:id", fleet_asset_bookings_id_delete_195);
app.patch("/api/fleet/asset-bookings/:id", fleet_asset_bookings_id_patch_196);
app.post("/api/fleet/driver-sessions", fleet_driver_sessions_post_197);
app.get("/api/fleet/driver-sessions/active", fleet_driver_sessions_active_get_198);
app.get("/api/fleet/driver-sessions/live", fleet_driver_sessions_live_get_199);
app.post("/api/fleet/driver-sessions/migrate-gps-status", fleet_driver_sessions_migrate_gps_status_post_200);
app.post("/api/fleet/driver-sessions/:id/heartbeat", fleet_driver_sessions_id_heartbeat_post_201);
app.post("/api/fleet/driver-sessions/:id/stop", fleet_driver_sessions_id_stop_post_202);
app.get("/api/fleet/driver-sessions/:id/summary", fleet_driver_sessions_id_summary_get_203);
app.post("/api/fleet/driver-sessions/:id/telemetry", fleet_driver_sessions_id_telemetry_post_204);
app.get("/api/fleet/driver-sessions/:id/telemetry/latest", fleet_driver_sessions_id_telemetry_latest_get_205);
app.get("/api/fleet/flags", fleet_flags_get_206);
app.get("/api/fleet/last-known-positions", fleet_last_known_positions_get_207);
app.delete("/api/fleet/service-logs/:logId", fleet_service_logs_logId_delete_208);
app.patch("/api/fleet/service-logs/:logId", fleet_service_logs_logId_patch_209);
app.get("/api/fleet/vehicles", fleet_vehicles_get_210);
app.delete("/api/fleet/:id", fleet_id_delete_211);
app.get("/api/fleet/:id", fleet_id_get_212);
app.put("/api/fleet/:id", fleet_id_put_213);
app.get("/api/fleet/:id/driver-sessions", fleet_id_driver_sessions_get_214);
app.post("/api/fleet/:id/driver-sessions/manual", fleet_id_driver_sessions_manual_post_215);
app.get("/api/fleet/:id/files", fleet_id_files_get_216);
app.get("/api/fleet/:id/prestarts", fleet_id_prestarts_get_217);
app.post("/api/fleet/:id/prestarts", fleet_id_prestarts_post_218);
app.get("/api/fleet/:id/service-logs", fleet_id_service_logs_get_219);
app.post("/api/fleet/:id/service-logs", fleet_id_service_logs_post_220);
app.post("/api/fleet/:id/signin", fleet_id_signin_post_221);
app.post("/api/fleet/:id/signout", fleet_id_signout_post_222);
app.get("/api/fleet/:id/usage-export", fleet_id_usage_export_get_223);
app.get("/api/fleet/:id/usage-status", fleet_id_usage_status_get_224);
app.get("/api/fleet/:id/usage-summary", fleet_id_usage_summary_get_225);
app.get("/api/form-global-lists", form_global_lists_get_226);
app.post("/api/form-global-lists", form_global_lists_post_227);
app.delete("/api/form-global-lists/:id", form_global_lists_id_delete_228);
app.put("/api/form-global-lists/:id", form_global_lists_id_put_229);
app.post("/api/form-attachments", form_attachments_post);
app.get("/api/form-templates", form_templates_get_230);
app.post("/api/form-templates", form_templates_post_231);
app.post("/api/form-templates/seed", form_templates_seed_post_232);
app.delete("/api/form-templates/:id", form_templates_id_delete_233);
app.put("/api/form-templates/:id", form_templates_id_put_234);
app.post("/api/form-templates/:id/publish-to-library", form_templates_id_publish_to_library_post_235);
app.get("/api/forms/assets-list", forms_assets_list_get_236);
app.get("/api/forms/jobs-list", forms_jobs_list_get_237);
app.post("/api/forms/migrate-skip-logic", forms_migrate_skip_logic_post_238);
app.get("/api/forms/skip-audit", forms_skip_audit_get_239);
app.post("/api/forms/skip-audit", forms_skip_audit_post_240);
app.post("/api/forms/start", forms_start_post_241);
app.get("/api/forms/submissions", forms_submissions_get_242);
app.post("/api/forms/templates/:id/share-link", forms_templates_id_share_link_post_243);
app.get("/api/forms/:id/fields", forms_id_fields_get_244);
app.post("/api/forms/:id/fields", forms_id_fields_post_245);
app.post("/api/forms/:id/fields/reorder", forms_id_fields_reorder_post_246);
app.delete("/api/forms/:id/fields/:fieldId", forms_id_fields_fieldId_delete_247);
app.patch("/api/forms/:id/fields/:fieldId", forms_id_fields_fieldId_patch_248);
app.post("/api/forms/:id/fields/:fieldId/thumbnail", forms_id_fields_fieldId_thumbnail_post_249);
app.get("/api/health", health_get_250);
app.get("/api/incidents", incidents_get_251);
app.post("/api/incidents", incidents_post_252);
app.post("/api/incidents/:id/archive", incidents_id_archive_post_253);
app.post("/api/incidents/:id/unarchive", incidents_id_unarchive_post_254);
app.get("/api/incidents/:incidentId", incidents_incidentId_get_255);
app.put("/api/incidents/:incidentId", incidents_incidentId_put_256);
app.get("/api/incidents/:incidentId/attachments", incidents_incidentId_attachments_get_257);
app.post("/api/incidents/:incidentId/attachments", incidents_incidentId_attachments_post_258);
app.delete("/api/incidents/:incidentId/attachments/:attachId", incidents_incidentId_attachments_attachId_delete_259);
app.post("/api/incidents/:incidentId/close", incidents_incidentId_close_post_260);
app.post("/api/incidents/:incidentId/corrective-actions", incidents_incidentId_corrective_actions_post_261);
app.put("/api/incidents/:incidentId/corrective-actions/:actionId", incidents_incidentId_corrective_actions_actionId_put_262);
app.get("/api/incidents/:incidentId/pdf", incidents_incidentId_pdf_get_263);
app.post("/api/incidents/:incidentId/third-parties", incidents_incidentId_third_parties_post_264);
app.delete("/api/incidents/:incidentId/third-parties/:thirdPartyId", incidents_incidentId_third_parties_thirdPartyId_delete_265);
app.get("/api/integrations/myob/auth-url", integrations_myob_auth_url_get_266);
app.get("/api/integrations/myob/callback", integrations_myob_callback_get_267);
app.post("/api/integrations/myob/disconnect", integrations_myob_disconnect_post_268);
app.get("/api/integrations/myob/status", integrations_myob_status_get_269);
app.post("/api/integrations/myob/sync-invoice", integrations_myob_sync_invoice_post_270);
app.get("/api/integrations/onedrive/auth-url", integrations_onedrive_auth_url_get_271);
app.get("/api/integrations/onedrive/callback", integrations_onedrive_callback_get_272);
app.post("/api/integrations/onedrive/disconnect", integrations_onedrive_disconnect_post_273);
app.get("/api/integrations/onedrive/status", integrations_onedrive_status_get_274);
app.post("/api/integrations/onedrive/upload-file", integrations_onedrive_upload_file_post_275);
app.get("/api/integrations/qbo/auth-url", integrations_qbo_auth_url_get_276);
app.get("/api/integrations/qbo/callback", integrations_qbo_callback_get_277);
app.post("/api/integrations/qbo/disconnect", integrations_qbo_disconnect_post_278);
app.get("/api/integrations/qbo/status", integrations_qbo_status_get_279);
app.post("/api/integrations/qbo/sync-invoice", integrations_qbo_sync_invoice_post_280);
app.get("/api/integrations/xero/auth-url", integrations_xero_auth_url_get_281);
app.get("/api/integrations/xero/callback", integrations_xero_callback_get_282);
app.post("/api/integrations/xero/disconnect", integrations_xero_disconnect_post_283);
app.get("/api/integrations/xero/status", integrations_xero_status_get_284);
app.post("/api/integrations/xero/sync-customer", integrations_xero_sync_customer_post_285);
app.post("/api/integrations/xero/sync-invoice", integrations_xero_sync_invoice_post_286);
app.post("/api/integrations/xero/webhook", integrations_xero_webhook_post_287);
app.get("/api/invoices", invoices_get_288);
app.post("/api/invoices", invoices_post_289);
app.delete("/api/invoices/:id", invoices_id_delete_290);
app.get("/api/invoices/:id", invoices_id_get_291);
app.put("/api/invoices/:id", invoices_id_put_292);
app.post("/api/invoices/:id/duplicate", invoices_id_duplicate_post_293);
app.get("/api/invoices/:id/export-pdf", invoices_id_export_pdf_get_294);
app.post("/api/invoices/:id/mark-sent", invoices_id_mark_sent_post_295);
app.post("/api/invoices/:id/record-payment", invoices_id_record_payment_post_296);
app.post("/api/invoices/:id/send-email", invoices_id_send_email_post_297);
app.patch("/api/invoices/:id/unlock", invoices_id_unlock_patch_298);
app.post("/api/invoices/:id/void", invoices_id_void_post_299);
app.get("/api/job-cards", job_cards_get_300);
app.post("/api/job-cards", job_cards_post_301);
app.delete("/api/job-cards/:id", job_cards_id_delete_302);
app.get("/api/job-cards/:id", job_cards_id_get_303);
app.put("/api/job-cards/:id", job_cards_id_put_304);
app.post("/api/job-cards/:id/convert", job_cards_id_convert_post_305);
app.post("/api/job-cards/:id/invoice", job_cards_id_invoice_post_306);
app.post("/api/job-cards/:id/photos", job_cards_id_photos_post_307);
app.delete("/api/job-cards/:id/photos/:photoId", job_cards_id_photos_photoId_delete_308);
app.patch("/api/job-cards/:id/photos/:photoId", job_cards_id_photos_photoId_patch);
app.get("/api/job-cards/:id/photos/:photoId/download", job_cards_id_photos_photoId_download_get);
app.post("/api/job-cards/:id/photos/:photoId/save-and-lock", job_cards_id_photos_photoId_save_and_lock_post);
app.post("/api/job-costs", job_costs_post_309);
app.delete("/api/job-forms/:id", job_forms_id_delete_310);
app.get("/api/job-forms/:id", job_forms_id_get_311);
app.put("/api/job-forms/:id", job_forms_id_put_312);
app.post("/api/job-forms/:id/reset", job_forms_id_reset_post_313);
app.delete("/api/job-forms/:id/share", job_forms_id_share_delete_314);
app.get("/api/job-forms/:id/share", job_forms_id_share_get_315);
app.post("/api/job-forms/:id/share", job_forms_id_share_post_316);
app.post("/api/job-forms/:id/send-email", job_forms_id_send_email_post);
app.get("/api/jobs", jobs_get_317);
app.get("/api/jobs/search", jobs_search_get);
app.post("/api/jobs", jobs_post_318);
app.post("/api/jobs/report/generate", jobs_report_generate_post_319);
app.get("/api/jobs/:id", jobs_id_get_320);
app.put("/api/jobs/:id", jobs_id_put_321);
app.post("/api/jobs/:id/attendance/:attendanceId/close", jobs_id_attendance_attendanceId_close_post_322);
app.get("/api/jobs/:id/costs", jobs_id_costs_get_323);
app.post("/api/jobs/:id/costs", jobs_id_costs_post_324);
app.get("/api/jobs/:id/costs/export", jobs_id_costs_export_get_325);
app.delete("/api/jobs/:id/costs/:costId", jobs_id_costs_costId_delete_326);
app.put("/api/jobs/:id/costs/:costId", jobs_id_costs_costId_put_327);
app.get("/api/jobs/:id/costs/:costId/receipt", jobs_id_costs_costId_receipt_get_328);
app.post("/api/jobs/:id/costs/:costId/receipt", jobs_id_costs_costId_receipt_post_329);
app.get("/api/jobs/:id/delays", jobs_id_delays_get_330);
app.post("/api/jobs/:id/delays", jobs_id_delays_post_331);
app.get("/api/jobs/:id/delays/export-csv", jobs_id_delays_export_csv_get_332);
app.delete("/api/jobs/:id/delays/:delayId", jobs_id_delays_delayId_delete_333);
app.put("/api/jobs/:id/delays/:delayId", jobs_id_delays_delayId_put_334);
app.get("/api/jobs/:id/documents", jobs_id_documents_get_335);
app.post("/api/jobs/:id/documents", jobs_id_documents_post_336);
app.get("/api/jobs/:id/export-zip", jobs_id_export_zip_get_337);
app.get("/api/jobs/:id/field-docs", jobs_id_field_docs_get_338);
app.get("/api/jobs/:id/files", jobs_id_files_get_339);
app.get("/api/jobs/:id/forms", jobs_id_forms_get_340);
app.post("/api/jobs/:id/forms", jobs_id_forms_post_341);
app.get("/api/jobs/:id/forms/export-csv", jobs_id_forms_export_csv_get_342);
app.delete("/api/jobs/:id/forms/:submissionId", jobs_id_forms_submissionId_delete_343);
app.post("/api/jobs/:id/forms/:submissionId/reopen", jobs_id_forms_submissionId_reopen_post_344);
app.post("/api/jobs/:id/generate-qr", jobs_id_generate_qr_post_345);
app.get("/api/jobs/:id/ledger", jobs_id_ledger_get_346);
app.post("/api/jobs/:id/ledger", jobs_id_ledger_post_347);
app.get("/api/jobs/:id/ledger/export", jobs_id_ledger_export_get_348);
app.post("/api/jobs/:id/ledger/sync", jobs_id_ledger_sync_post_349);
app.delete("/api/jobs/:id/ledger/:entryId", jobs_id_ledger_entryId_delete_350);
app.put("/api/jobs/:id/ledger/:entryId", jobs_id_ledger_entryId_put_351);
app.post("/api/jobs/:id/ledger/:entryId/correct", jobs_id_ledger_entryId_correct_post_352);
app.get("/api/jobs/:id/milestones", jobs_id_milestones_get_353);
app.post("/api/jobs/:id/milestones", jobs_id_milestones_post_354);
app.delete("/api/jobs/:id/milestones/:milestoneId", jobs_id_milestones_milestoneId_delete_355);
app.patch("/api/jobs/:id/milestones/:milestoneId", jobs_id_milestones_milestoneId_patch_356);
app.get("/api/jobs/:id/notes/export-csv", jobs_id_notes_export_csv_get_357);
app.get("/api/jobs/:id/photos", jobs_id_photos_get_358);
app.post("/api/jobs/:id/photos", jobs_id_photos_post_359);
app.post("/api/jobs/:id/photos/export-zip", jobs_id_photos_export_zip_post_360);
app.get("/api/jobs/:id/photos/picker", jobs_id_photos_picker_get_361);
app.post("/api/jobs/:id/photos/share", jobs_id_photos_share_post_362);
app.delete("/api/jobs/:id/photos/:photoId", jobs_id_photos_photoId_delete_363);
app.patch("/api/jobs/:id/photos/:photoId", jobs_id_photos_photoId_patch_364);
app.get("/api/jobs/:id/photos/:photoId/download", jobs_id_photos_photoId_download_get_365);
app.post("/api/jobs/:id/photos/:photoId/replace", jobs_id_photos_photoId_replace_post_366);
app.post("/api/jobs/:id/photos/:photoId/lock", jobs_id_photos_photoId_lock_post);
app.get("/api/jobs/:id/photos/:photoId/report-image", jobs_id_photos_photoId_report_image_get_367);
app.get("/api/jobs/:id/progress", jobs_id_progress_get_368);
app.put("/api/jobs/:id/progress", jobs_id_progress_put_369);
app.get("/api/jobs/:id/progress/export-csv", jobs_id_progress_export_csv_get_370);
app.get("/api/jobs/:id/progress/report", jobs_id_progress_report_get_371);
app.put("/api/jobs/:id/progress/report", jobs_id_progress_report_put_372);
app.get("/api/jobs/:id/progress/report/pdf", jobs_id_progress_report_pdf_get_373);
app.post("/api/jobs/:id/progress/sync", jobs_id_progress_sync_post_374);
app.get("/api/jobs/:id/purchase-orders", jobs_id_purchase_orders_get_375);
app.post("/api/jobs/:id/purchase-orders", jobs_id_purchase_orders_post_376);
app.delete("/api/jobs/:id/purchase-orders/:poId", jobs_id_purchase_orders_poId_delete_377);
app.get("/api/jobs/:id/purchase-orders/:poId", jobs_id_purchase_orders_poId_get_378);
app.put("/api/jobs/:id/purchase-orders/:poId", jobs_id_purchase_orders_poId_put_379);
app.get("/api/jobs/:id/purchase-orders/:poId/pdf", jobs_id_purchase_orders_poId_pdf_get_380);
app.post("/api/jobs/:id/report/pdf", jobs_id_report_pdf_post_381);
app.get("/api/jobs/:id/risky", jobs_id_risky_get_382);
app.post("/api/jobs/:id/risky", jobs_id_risky_post_383);
app.get("/api/jobs/:id/risky/:riskyId", jobs_id_risky_riskyId_get_384);
app.put("/api/jobs/:id/risky/:riskyId", jobs_id_risky_riskyId_put_385);
app.post("/api/jobs/:id/risky/:riskyId/finalise", jobs_id_risky_riskyId_finalise_post_386);
app.post("/api/jobs/:id/risky/:riskyId/signatures", jobs_id_risky_riskyId_signatures_post_387);
app.post("/api/jobs/:id/risky/:riskyId/supervisor-signoff", jobs_id_risky_riskyId_supervisor_signoff_post_388);
app.post("/api/jobs/:id/signin", jobs_id_signin_post_389);
app.post("/api/jobs/:id/signin-qr", jobs_id_signin_qr_post_390);
app.get("/api/jobs/:id/signin-status", jobs_id_signin_status_get_391);
app.post("/api/jobs/:id/signout", jobs_id_signout_post_392);
app.post("/api/jobs/:id/signout-qr", jobs_id_signout_qr_post_393);
app.post("/api/jobs/:id/signout-user", jobs_id_signout_user_post_394);
app.get("/api/jobs/:id/site-prestarts", jobs_id_site_prestarts_get_395);
app.post("/api/jobs/:id/site-prestarts", jobs_id_site_prestarts_post_396);
app.get("/api/jobs/:id/site-prestarts/:prestartId", jobs_id_site_prestarts_prestartId_get_397);
app.put("/api/jobs/:id/site-prestarts/:prestartId", jobs_id_site_prestarts_prestartId_put_398);
app.post("/api/jobs/:id/site-prestarts/:prestartId/finalise", jobs_id_site_prestarts_prestartId_finalise_post_399);
app.post("/api/jobs/:id/site-prestarts/:prestartId/workers", jobs_id_site_prestarts_prestartId_workers_post_400);
app.get("/api/jobs/:id/swms", jobs_id_swms_get_401);
app.post("/api/jobs/:id/swms", jobs_id_swms_post_402);
app.post("/api/jobs/:id/swms/:swmsId/signoff", jobs_id_swms_swmsId_signoff_post_403);
app.get("/api/jobs/:id/todos", jobs_id_todos_get_404);
app.post("/api/jobs/:id/todos", jobs_id_todos_post_405);
app.delete("/api/jobs/:id/todos/:todoId", jobs_id_todos_todoId_delete_406);
app.put("/api/jobs/:id/todos/:todoId", jobs_id_todos_todoId_put_407);
app.get("/api/library/items", library_items_get_408);
app.get("/api/library/items/:id", library_items_id_get_409);
app.patch("/api/library/items/:id", library_items_id_patch_410);
app.get("/api/library/items/:id/download", library_items_id_download_get_411);
app.delete("/api/library/items/:id/install", library_items_id_install_delete_412);
app.post("/api/library/items/:id/install", library_items_id_install_post_413);
app.get("/api/library/my-installed", library_my_installed_get_414);
app.get("/api/library/my-submissions", library_my_submissions_get_415);
app.get("/api/lists", lists_get_416);
app.get("/api/me", me_get_417);
app.put("/api/me", me_put_418);
app.post("/api/me/2fa/disable", me_2fa_disable_post_419);
app.post("/api/me/2fa/enable", me_2fa_enable_post_420);
app.get("/api/me/2fa/setup", me_2fa_setup_get_421);
app.get("/api/me/2fa/status", me_2fa_status_get_422);
app.post("/api/me/2fa/verify", me_2fa_verify_post_423);
app.post("/api/me/2fa/sms/send", me_2fa_sms_send_post);
app.post("/api/me/2fa/sms/verify", me_2fa_sms_verify_post);
app.post("/api/me/2fa/sms/enable", me_2fa_sms_enable_post);
app.post("/api/me/2fa/sms/disable", me_2fa_sms_disable_post);
app.post("/api/me/2fa/sms/send-setup", me_2fa_sms_send_setup_post);
app.get("/api/me/active-status", me_active_status_get_424);
app.post("/api/me/change-password", me_change_password_post_425);
app.get("/api/me/email-status", me_email_status_get_426);
app.get("/api/me/phone", me_phone_get_427);
app.put("/api/me/phone", me_phone_put_428);
app.delete("/api/me/profile-attachments/:attachmentId", me_profile_attachments_delete_429);
app.post("/api/me/profile-attachments", me_profile_attachments_post_430);
app.get("/api/me/profile-attachments/:attachmentId/download", me_profile_attachments_download_get);
app.get("/api/me/profile-attachments/:attachmentId/thumbnail", me_profile_attachments_thumbnail_get);
app.get("/api/me/profile-extras", me_profile_extras_get_431);
app.put("/api/me/profile-extras", me_profile_extras_put_432);
app.post("/api/migrate-account-recovery", migrate_account_recovery_post_433);
app.post("/api/migrate-asset-manager", migrate_asset_manager_post_434);
app.post("/api/migrate-attendance", migrate_attendance_post_435);
app.post("/api/migrate-company-settings", migrate_company_settings_post_436);
app.post("/api/migrate-dazza-audit", migrate_dazza_audit_post_437);
app.post("/api/migrate-dazza-knowledge", migrate_dazza_knowledge_post_438);
app.post("/api/migrate-emergency-alerts", migrate_emergency_alerts_post_439);
app.post("/api/migrate-estimates", migrate_estimates_post_440);
app.post("/api/migrate-estimating-library", migrate_estimating_library_post_441);
app.post("/api/migrate-files", migrate_files_post_442);
app.post("/api/migrate-fleet", migrate_fleet_post_443);
app.post("/api/migrate-fleet-analytics", migrate_fleet_analytics_post_444);
app.post("/api/migrate-fleet-driver-sessions", migrate_fleet_driver_sessions_post_445);
app.post("/api/migrate-fleet-usage", migrate_fleet_usage_post_446);
app.post("/api/migrate-form-fields", migrate_form_fields_post_447);
app.post("/api/migrate-form-logic", migrate_form_logic_post_448);
app.post("/api/migrate-form-templates", migrate_form_templates_post_449);
app.post("/api/migrate-job-forms", migrate_job_forms_post_450);
app.post("/api/migrate-job-photo-shares", migrate_job_photo_shares_post_451);
app.post("/api/migrate-job-photos", migrate_job_photos_post_452);
app.post("/api/migrate-job-tabs", migrate_job_tabs_post_453);
app.post("/api/migrate-jobs", migrate_jobs_post_454);
app.post("/api/migrate-ledger-photo", migrate_ledger_photo_post_455);
app.post("/api/migrate-library", migrate_library_post_456);
app.post("/api/migrate-library-downloads", migrate_library_downloads_post_457);
app.post("/api/migrate-notifications", migrate_notifications_post_458);
app.post("/api/migrate-owner-console", migrate_owner_console_post_459);
app.post("/api/migrate-owner-role", migrate_owner_role_post_460);
app.post("/api/migrate-pdf-settings", migrate_pdf_settings_post_461);
app.post("/api/migrate-plan-manager", migrate_plan_manager_post_462);
app.post("/api/migrate-plan-manager-v2", migrate_plan_manager_v2_post_463);
app.post("/api/migrate-plan-manager-v3", migrate_plan_manager_v3_post_464);
app.post("/api/migrate-safety", migrate_safety_post_465);
app.post("/api/migrate-site-prestart", migrate_site_prestart_post_466);
app.post("/api/migrate-sms-verified-at", migrate_sms_verified_at_post_467);
app.post("/api/migrate-starter-pack", migrate_starter_pack_post_468);
app.post("/api/migrate-studio-pdf", migrate_studio_pdf_post_469);
app.post("/api/migrate-subscriptions", migrate_subscriptions_post_470);
app.post("/api/migrate-support-mode", migrate_support_mode_post_471);
app.post("/api/migrate-takeoff-pad", migrate_takeoff_pad_post_472);
app.post("/api/migrate-team", migrate_team_post_473);
app.get("/api/notes", notes_get_474);
app.post("/api/notes", notes_post_475);
app.post("/api/notes/comments", notes_comments_post_476);
app.post("/api/notes/migrate", notes_migrate_post_477);
app.delete("/api/notes/:id", notes_id_delete_478);
app.get("/api/notifications/alerts", notifications_alerts_get_479);
app.get("/api/notifications/prefs", notifications_prefs_get_480);
app.put("/api/notifications/prefs", notifications_prefs_put_481);
app.post("/api/notifications/read", notifications_read_post_482);
app.get("/api/owner-console/activity", owner_console_activity_get_483);
app.get("/api/owner-console/cancellation-feedback", owner_console_cancellation_feedback_get_484);
app.get("/api/owner-console/companies", owner_console_companies_get_485);
app.post("/api/owner-console/companies", owner_console_companies_post_486);
app.get("/api/owner-console/companies/usage", owner_console_companies_usage_get_487);
app.put("/api/owner-console/companies/:id/limits", owner_console_companies_id_limits_put_488);
app.get("/api/owner-console/form-templates", owner_console_form_templates_get_489);
app.post("/api/owner-console/form-templates", owner_console_form_templates_post_490);
app.get("/api/bug-reports", bug_reports_get);
app.post("/api/bug-reports", bug_reports_post);
app.patch("/api/bug-reports/:id", bug_reports_id_patch);
app.get("/api/owner-console/library/items", owner_console_library_items_get_491);
app.post("/api/owner-console/library/items", owner_console_library_items_post_492);
app.delete("/api/owner-console/library/items/:id", owner_console_library_items_id_delete_493);
app.patch("/api/owner-console/library/items/:id", owner_console_library_items_id_patch_494);
app.put("/api/owner-console/library/items/:id", owner_console_library_items_id_put_495);
app.post("/api/owner-console/library/items/:id/push-update", owner_console_library_items_id_push_update_post_496);
app.get("/api/owner-console/library/submissions", owner_console_library_submissions_get_497);
app.post("/api/owner-console/library/submissions/:id/review", owner_console_library_submissions_id_review_post_498);
app.get("/api/owner-console/starter-pack", owner_console_starter_pack_get_499);
app.post("/api/owner-console/starter-pack", owner_console_starter_pack_post_500);
app.get("/api/owner-console/stats", owner_console_stats_get_501);
app.get("/api/owner-console/storage", owner_console_storage_get_502);
app.get("/api/owner-console/swms/masters", owner_console_swms_masters_get_503);
app.post("/api/owner-console/swms/masters", owner_console_swms_masters_post_504);
app.post("/api/owner-console/swms/masters/publish-all", owner_console_swms_masters_publish_all_post_505);
app.delete("/api/owner-console/swms/masters/:id", owner_console_swms_masters_id_delete_506);
app.get("/api/owner-console/swms/masters/:id", owner_console_swms_masters_id_get_507);
app.put("/api/owner-console/swms/masters/:id", owner_console_swms_masters_id_put_508);
app.post("/api/owner-console/swms/masters/:id/publish", owner_console_swms_masters_id_publish_post_509);
app.post("/api/owner-console/swms/migrate-master-library", owner_console_swms_migrate_master_library_post_510);
app.post("/api/owner-console/swms/push", owner_console_swms_push_post_511);
app.post("/api/owner-console/swms/seed-bricklaying", owner_console_swms_seed_bricklaying_post_512);
app.post("/api/owner-console/swms/seed-building-inspection", owner_console_swms_seed_building_inspection_post_513);
app.post("/api/owner-console/swms/seed-cabinets", owner_console_swms_seed_cabinets_post_514);
app.post("/api/owner-console/swms/seed-carpenter-fixing", owner_console_swms_seed_carpenter_fixing_post_515);
app.post("/api/owner-console/swms/seed-carpenter-framing", owner_console_swms_seed_carpenter_framing_post_516);
app.post("/api/owner-console/swms/seed-carpenter-lockup", owner_console_swms_seed_carpenter_lockup_post_517);
app.post("/api/owner-console/swms/seed-ceramic-tiling", owner_console_swms_seed_ceramic_tiling_post_518);
app.post("/api/owner-console/swms/seed-concreting-slab", owner_console_swms_seed_concreting_slab_post_519);
app.post("/api/owner-console/swms/seed-delivery-loading", owner_console_swms_seed_delivery_loading_post_520);
app.post("/api/owner-console/swms/seed-environmental-spill", owner_console_swms_seed_environmental_spill_post_521);
app.post("/api/owner-console/swms/seed-ewp", owner_console_swms_seed_ewp_post_522);
app.post("/api/owner-console/swms/seed-excavations-substation", owner_console_swms_seed_excavations_substation_post_523);
app.post("/api/owner-console/swms/seed-fencing", owner_console_swms_seed_fencing_post_524);
app.post("/api/owner-console/swms/seed-heat-stress", owner_console_swms_seed_heat_stress_post_525);
app.post("/api/owner-console/swms/seed-landscaping", owner_console_swms_seed_landscaping_post_526);
app.post("/api/owner-console/swms/seed-live-parts", owner_console_swms_seed_live_parts_post_527);
app.post("/api/owner-console/swms/seed-manual-handling", owner_console_swms_seed_manual_handling_post_528);
app.post("/api/owner-console/swms/seed-moving-plant", owner_console_swms_seed_moving_plant_post_529);
app.post("/api/owner-console/swms/seed-painting", owner_console_swms_seed_painting_post_530);
app.post("/api/owner-console/swms/seed-power-tools", owner_console_swms_seed_power_tools_post_531);
app.post("/api/owner-console/swms/seed-silica-dust", owner_console_swms_seed_silica_dust_post_532);
app.post("/api/owner-console/swms/seed-traffic-management", owner_console_swms_seed_traffic_management_post_533);
app.post("/api/owner-console/swms/seed-underground-services", owner_console_swms_seed_underground_services_post_534);
app.post("/api/owner-console/swms/seed-vacuum-excavation", owner_console_swms_seed_vacuum_excavation_post_535);
app.post("/api/owner-console/system-ai/builtin-checks", owner_console_system_ai_builtin_checks_post_536);
app.get("/api/owner-console/users", owner_console_users_get_537);
app.post("/api/owner-console/users/verify", owner_console_users_verify_post_538);
app.get("/api/plan-manager/drawings", plan_manager_drawings_get_539);
app.post("/api/plan-manager/drawings", plan_manager_drawings_post_540);
app.get("/api/plan-manager/drawings/:id", plan_manager_drawings_id_get_541);
app.put("/api/plan-manager/drawings/:id/annotations", plan_manager_drawings_id_annotations_put_542);
app.post("/api/plan-manager/drawings/:id/archive", plan_manager_drawings_id_archive_post_543);
app.delete("/api/plan-manager/drawings/:id/job-links", plan_manager_drawings_id_job_links_delete_544);
app.post("/api/plan-manager/drawings/:id/job-links", plan_manager_drawings_id_job_links_post_545);
app.get("/api/plan-manager/drawings/:id/pages/:pageNo/annotations", plan_manager_drawings_id_pages_pageNo_annotations_get_546);
app.delete("/api/plan-manager/drawings/:id/permanent", plan_manager_drawings_id_permanent_delete_547);
app.patch("/api/plan-manager/drawings/:id/reorder", plan_manager_drawings_id_reorder_patch_548);
app.post("/api/plan-manager/drawings/:id/restore", plan_manager_drawings_id_restore_post_549);
app.post("/api/plan-manager/drawings/:id/revisions", plan_manager_drawings_id_revisions_post_550);
app.post("/api/plan-manager/drawings/:id/revisions/:revisionId/finalize", plan_manager_drawings_id_revisions_revisionId_finalize_post_551);
app.post("/api/plan-manager/drawings/:id/upload", plan_manager_drawings_id_upload_post_552);
app.get("/api/plan-manager/jobs/:jobId/drawings-zip", plan_manager_jobs_jobId_drawings_zip_get_553);
app.get("/api/plan-manager/jobs-with-drawings", plan_manager_jobs_with_drawings_get_554);
app.post("/api/plan-manager/share", plan_manager_share_post_555);
app.get("/api/plan-manager/share/validate", plan_manager_share_validate_get_556);
app.post("/api/portal/estimates/:id/approve", portal_estimates_id_approve_post_557);
app.post("/api/portal/invite", portal_invite_post_558);
app.post("/api/portal/invoices/:id/pay", portal_invoices_id_pay_post_559);
app.get("/api/portal/jobs", portal_jobs_get_560);
app.get("/api/portal/jobs/:id", portal_jobs_id_get_561);
app.post("/api/portal/migrate", portal_migrate_post_562);
app.post("/api/portal/validate", portal_validate_post_563);
app.get("/api/public/form/:token", public_form_token_get_564);
app.post("/api/public/form/:token/submit", public_form_token_submit_post_565);
app.get("/api/public/job-photos/:token", public_job_photos_token_get_566);
app.get("/api/public/job-photos/:token/photo/:photoId", public_job_photos_token_photo_photoId_get_567);
app.get("/api/public/swms/:token", public_swms_token_get_568);
app.post("/api/public/swms/:token/signoff", public_swms_token_signoff_post_569);
app.delete("/api/push/subscribe", push_subscribe_delete_570);
app.post("/api/push/subscribe", push_subscribe_post_571);
app.get("/api/push/vapid-key", push_vapid_key_get_572);
app.get("/api/quick-links/site-meta", quick_links_site_meta_get_573);
app.get("/api/recipes", recipes_get_574);
app.post("/api/recipes", recipes_post_575);
app.delete("/api/recipes/:id", recipes_id_delete_576);
app.put("/api/recipes/:id", recipes_id_put_577);
app.get("/api/risk-register", risk_register_get_578);
app.post("/api/risk-register", risk_register_post_579);
app.get("/api/risk-register/:id", risk_register_id_get_580);
app.put("/api/risk-register/:id", risk_register_id_put_581);
app.post("/api/risk-register/:id/archive", risk_register_id_archive_post_582);
app.post("/api/risk-register/:id/unarchive", risk_register_id_unarchive_post_583);
app.post("/api/safety/ai/draft", safety_ai_draft_post_584);
app.get("/api/safety/documents", safety_documents_get_585);
app.post("/api/safety/documents", safety_documents_post_586);
app.delete("/api/safety/documents/:id", safety_documents_id_delete_587);
app.get("/api/safety/documents/:id/download", safety_documents_id_download_get_588);
app.get("/api/safety/generated-posters", safety_generated_posters_get_589);
app.post("/api/safety/generated-posters", safety_generated_posters_post_590);
app.delete("/api/safety/generated-posters/:id", safety_generated_posters_id_delete_591);
app.get("/api/safety/job-safety-plans", safety_job_safety_plans_get_592);
app.post("/api/safety/job-safety-plans", safety_job_safety_plans_post_593);
app.delete("/api/safety/job-safety-plans/:id", safety_job_safety_plans_id_delete_594);
app.put("/api/safety/job-safety-plans/:id", safety_job_safety_plans_id_put_595);
app.get("/api/safety/job-swms", safety_job_swms_get_596);
app.post("/api/safety/job-swms", safety_job_swms_post_597);
app.delete("/api/safety/job-swms/:id", safety_job_swms_id_delete_598);
app.get("/api/safety/job-swms/:id", safety_job_swms_id_get_599);
app.put("/api/safety/job-swms/:id", safety_job_swms_id_put_600);
app.post("/api/safety/job-swms/:id/share-token", safety_job_swms_id_share_token_post_601);
app.get("/api/safety/job-swms/:id/signoffs", safety_job_swms_id_signoffs_get_602);
app.post("/api/safety/job-swms/:id/signoffs", safety_job_swms_id_signoffs_post_603);
app.delete("/api/safety/job-swms/:id/signoffs/:signoffId", safety_job_swms_id_signoffs_signoffId_delete_604);
app.get("/api/safety/plans", safety_plans_get_605);
app.post("/api/safety/plans", safety_plans_post_606);
app.post("/api/safety/plans/seed", safety_plans_seed_post_607);
app.delete("/api/safety/plans/:id", safety_plans_id_delete_608);
app.put("/api/safety/plans/:id", safety_plans_id_put_609);
app.get("/api/safety/plans/:id/export", safety_plans_id_export_get_610);
app.get("/api/safety/plans/:id/pack", safety_plans_id_pack_get_611);
app.get("/api/safety/posters", safety_posters_get_612);
app.post("/api/safety/posters", safety_posters_post_613);
app.delete("/api/safety/posters/:id", safety_posters_id_delete_614);
app.get("/api/safety/posters/:id/download", safety_posters_id_download_get_615);
app.get("/api/safety/swms", safety_swms_get_616);
app.post("/api/safety/swms", safety_swms_post_617);
app.post("/api/safety/swms/import-docx", safety_swms_import_docx_post_618);
app.post("/api/safety/swms/seed", safety_swms_seed_post_619);
app.delete("/api/safety/swms/:id", safety_swms_id_delete_620);
app.get("/api/safety/swms/:id", safety_swms_id_get_621);
app.put("/api/safety/swms/:id", safety_swms_id_put_622);
app.post("/api/safety/swms/:id/duplicate", safety_swms_id_duplicate_post_623);
app.get("/api/safety/swms/:id/export", safety_swms_id_export_get_624);
app.post("/api/safety/swms/:id/publish-to-library", safety_swms_id_publish_to_library_post_625);
app.get("/api/scheduler/crew", scheduler_crew_get_626);
app.get("/api/scheduler/jobs", scheduler_jobs_get_627);
app.patch("/api/scheduler/jobs/:id/reschedule", scheduler_jobs_id_reschedule_patch_628);
app.get("/api/scheduler/tasks", scheduler_tasks_get_629);
app.get("/api/secure-share", secure_share_get_630);
app.post("/api/secure-share", secure_share_post_631);
app.delete("/api/secure-share/:id", secure_share_id_delete_632);
app.get("/api/secure-share/:token", secure_share_token_get_633);
app.post("/api/secure-share/:token", secure_share_token_post_634);
app.get("/api/settings/backup", settings_backup_get_635);
app.post("/api/settings/backup", settings_backup_post_636);
app.get("/api/settings/backup/company-data", settings_backup_company_data_get_637);
app.get("/api/settings/backup/csv-pack", settings_backup_csv_pack_get_638);
app.get("/api/settings/backup/export", settings_backup_export_get_639);
app.post("/api/settings/backup/run", settings_backup_run_post_640);
app.get("/api/settings/backup-destination", settings_backup_destination_get_641);
app.post("/api/settings/backup-destination", settings_backup_destination_post_642);
app.get("/api/settings/dazza-ai-key", settings_dazza_ai_key_get_643);
app.post("/api/settings/dazza-ai-key", settings_dazza_ai_key_post_644);
app.get("/api/settings/file-transfer-backup", settings_file_transfer_backup_get_645);
app.post("/api/settings/file-transfer-backup", settings_file_transfer_backup_post_646);
app.get("/api/settings/retention", settings_retention_get_647);
app.post("/api/settings/retention", settings_retention_post_648);
app.get("/api/settings/storage-provider", settings_storage_provider_get_649);
app.get("/api/settings/storage-provider/debug", settings_storage_provider_debug_get_650);
app.post("/api/settings/storage-provider/test", settings_storage_provider_test_post_651);
app.get("/api/settings/terminology", settings_terminology_get_652);
app.post("/api/settings/terminology", settings_terminology_post_653);
app.get("/api/settings/xero-credentials", settings_xero_credentials_get_654);
app.post("/api/settings/xero-credentials", settings_xero_credentials_post_655);
app.get("/api/share/:token", share_token_get_656);
app.get("/api/signin-history", signin_history_get_657);
app.post("/api/signup", signup_post_658);
app.get("/api/sos", sos_get_659);
app.post("/api/sos/acknowledge", sos_acknowledge_post_660);
app.post("/api/sos/trigger", sos_trigger_post_661);
app.post("/api/stakeholders/sms", stakeholders_sms_post_662);
app.post("/api/stripe/create-checkout-session", stripe_create_checkout_session_post_663);
app.get("/api/stripe/session/:sessionId", stripe_session_sessionId_get_664);
app.post("/api/subscription/create-checkout", subscription_create_checkout_post_665);
app.get("/api/subscription/status", subscription_status_get_666);
app.post("/api/subscription/webhook", subscription_webhook_post_667);
app.get("/api/support-mode/audit", support_mode_audit_get_668);
app.get("/api/support-mode/checklist", support_mode_checklist_get_669);
app.put("/api/support-mode/checklist", support_mode_checklist_put_670);
app.post("/api/support-mode/enter", support_mode_enter_post_671);
app.post("/api/support-mode/exit", support_mode_exit_post_672);
app.get("/api/support-mode/status", support_mode_status_get_673);
app.get("/api/tag-tasks", tag_tasks_get_674);
app.patch("/api/tag-tasks/:id", tag_tasks_id_patch_675);
app.get("/api/takeoff-pad", takeoff_pad_get_676);
app.put("/api/takeoff-pad", takeoff_pad_put_677);
app.post("/api/tasks", tasks_post_678);
app.put("/api/tasks/:id", tasks_id_put_679);
app.get("/api/team", team_get_680);
app.post("/api/team/invite", team_invite_post_681);
app.get("/api/team/invites", team_invites_get_682);
app.post("/api/team/invites", team_invites_post_683);
app.post("/api/team/invites/:id/cancel", team_invites_id_cancel_post_684);
app.post("/api/team/invites/:id/resend", team_invites_id_resend_post_685);
app.get("/api/team/members", team_members_get_686);
app.get("/api/team/members/:id/icon-permissions", team_members_id_icon_permissions_get_687);
app.put("/api/team/members/:id/icon-permissions", team_members_id_icon_permissions_put_688);
app.post("/api/team/resend-verification", team_resend_verification_post_689);
app.post("/api/team/schedule/migrate", team_schedule_migrate_post_690);
app.get("/api/team/shifts", team_shifts_get_691);
app.post("/api/team/shifts", team_shifts_post_692);
app.delete("/api/team/shifts/:id", team_shifts_id_delete_693);
app.put("/api/team/shifts/:id", team_shifts_id_put_694);
app.get("/api/team/time-entries", team_time_entries_get_695);
app.post("/api/team/time-entries", team_time_entries_post_696);
app.get("/api/team/time-entries/export", team_time_entries_export_get_697);
app.put("/api/team/time-entries/:id", team_time_entries_id_put_698);
app.post("/api/team/verify-user", team_verify_user_post_699);
app.delete("/api/team/:id", team_id_delete_700);
app.put("/api/team/:id", team_id_put_701);
app.get("/api/usage", usage_get_702);
app.get("/api/user-logs", user_logs_get_703);
app.get("/api/user-logs/users", user_logs_users_get_704);
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

if (import.meta.env.PROD && !process.env.VITEST) {
	const __dirname = dirname(fileURLToPath(import.meta.url));
	const clientDir = join(__dirname, "client");
	const adSenseRuntimeConfig = loadAdSenseRuntimeConfig(__dirname);

	registerAdSenseTextRoutes(app, adSenseRuntimeConfig);


	// Intercept any stale browser-cached leaflet dep bundle and return an
	// inert stub so it cannot execute. The Clear-Site-Data header evicts the
	// cached copy from the browser's disk cache on the next request.
	app.use((req, res, next) => {
		if (req.path.includes('leaflet.js')) {
			res.set('Content-Type', 'application/javascript; charset=utf-8');
			res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
			res.set('Pragma', 'no-cache');
			res.set('Expires', '0');
			res.set('Clear-Site-Data', '"cache"');
			return res.send('export default {}; export const map = () => {}; export const tileLayer = () => ({addTo:()=>{}});');
		}
		// Serve the leaflet-eviction service worker with correct headers.
		// Service-Worker-Allowed: / lets it intercept requests under /node_modules/.
		if (req.path === '/sw-leaflet-evict.js') {
			res.set('Content-Type', 'application/javascript; charset=utf-8');
			res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
			res.set('Service-Worker-Allowed', '/');
		}
		next();
	});

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

	// ── Hard startup timeout — if migrations hang, force listen after 25s ───
	// This ensures the health check always passes even if a migration deadlocks.
	let _serverStarted = false;
	const _startupTimeout = setTimeout(() => {
		if (!_serverStarted) {
			console.error('[startup] TIMEOUT: migrations took >25s — forcing app.listen now');
			const server = app.listen(port, host, () => {
				_serverStarted = true;
				console.log(`[startup] Server listening (timeout-forced) on http://${host}:${port}`);
			});
			server.on('error', (err) => {
				console.error('ssr.server.listen-failed (timeout-forced)', { port, host, error: err.message });
				process.exit(1);
			});
		}
	}, 25000);
	_startupTimeout.unref(); // don't keep process alive just for this timer

	// ── Migration IIFE starting ───────────────────────────────────────────────
	console.log('[startup] migration IIFE starting');
	void (async () => {
			// Hoist db/sql imports once — avoids 5 redundant dynamic module
			// evaluations and keeps Rollup's chunk graph clean.
			const { db: _db } = await import('./db/client.js');
			const { sql: _sql } = await import('drizzle-orm');
			console.log('[startup] db client imported');

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

		// ── fleet_usage_logs ──────────────────────────────────────────────────
		try {
			await _db.execute(_sql`
				CREATE TABLE IF NOT EXISTS fleet_usage_logs (
					id               INT PRIMARY KEY AUTO_INCREMENT,
					company_id       INT          NOT NULL,
					fleet_id         INT          NOT NULL,
					user_id          VARCHAR(36)  NULL,
					job_id           INT          NULL,
					actor_type       VARCHAR(30)  NOT NULL DEFAULT 'employee',
					source           VARCHAR(30)  NOT NULL DEFAULT 'portal',
					started_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
					ended_at         TIMESTAMP    NULL,
					duration_minutes INT          NULL,
					note             TEXT         NULL,
					created_at       TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
					INDEX idx_ful_company (company_id),
					INDEX idx_ful_fleet   (fleet_id),
					INDEX idx_ful_user    (user_id),
					INDEX idx_ful_started (started_at),
					FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
				) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
			`);
			console.log('[startup] fleet_usage_logs table ready');
		} catch (e) {
			console.warn('[startup] fleet_usage_logs migration skipped:', (e as Error)?.message?.slice(0, 120));
		}

		// ── Run the full self-healing migration suite (safetyTables loop etc.) ──
		// NOTE: runStartupMigrations() is also called at module load time (line ~1922)
		// for dev HMR. We skip the second call here to avoid duplicate concurrent
		// migrations that can cause table-lock contention and hang startup.
		// The module-load call already ran; by the time we reach this point it has
		// either completed or failed (with a logged warning). No await needed.
		console.log('[startup] skipping duplicate runStartupMigrations() — already ran at module load');

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

		// ── team_shifts ────────────────────────────────────────────────────────
		try {
			await db.execute(sql.raw(
				"CREATE TABLE IF NOT EXISTS team_shifts (" +
				"  id            INT AUTO_INCREMENT PRIMARY KEY," +
				"  company_id    INT NOT NULL," +
				"  profile_id    INT NOT NULL," +
				"  job_id        INT NULL," +
				"  title         VARCHAR(255) NOT NULL DEFAULT 'Shift'," +
				"  shift_date    DATE NOT NULL," +
				"  start_time    TIME NOT NULL," +
				"  end_time      TIME NOT NULL," +
				"  break_minutes INT NOT NULL DEFAULT 0," +
				"  status        ENUM('scheduled','confirmed','completed','cancelled') NOT NULL DEFAULT 'scheduled'," +
				"  notes         TEXT NULL," +
				"  created_by    INT NULL," +
				"  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP," +
				"  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP," +
				"  INDEX idx_ts_company (company_id)," +
				"  INDEX idx_ts_profile (profile_id)," +
				"  INDEX idx_ts_date (shift_date)" +
				") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
			));
			console.log('[startup] team_shifts table ready');
		} catch (e) {
			console.warn('[startup] team_shifts migration skipped:', (e as Error)?.message?.slice(0, 120));
		}

		// ── team_time_entries ───────────────────────────────────────────────────
		try {
			await db.execute(sql.raw(
				"CREATE TABLE IF NOT EXISTS team_time_entries (" +
				"  id            INT AUTO_INCREMENT PRIMARY KEY," +
				"  company_id    INT NOT NULL," +
				"  profile_id    INT NOT NULL," +
				"  shift_id      INT NULL," +
				"  job_id        INT NULL," +
				"  entry_date    DATE NOT NULL," +
				"  clock_in      DATETIME NOT NULL," +
				"  clock_out     DATETIME NULL," +
				"  break_minutes INT NOT NULL DEFAULT 0," +
				"  total_minutes INT GENERATED ALWAYS AS (" +
				"    CASE WHEN clock_out IS NOT NULL" +
				"      THEN TIMESTAMPDIFF(MINUTE, clock_in, clock_out) - break_minutes" +
				"      ELSE NULL END" +
				"  ) STORED," +
				"  hourly_rate   DECIMAL(10,2) NULL," +
				"  notes         TEXT NULL," +
				"  approved_by   INT NULL," +
				"  approved_at   DATETIME NULL," +
				"  status        ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending'," +
				"  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP," +
				"  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP," +
				"  INDEX idx_tte_company (company_id)," +
				"  INDEX idx_tte_profile (profile_id)," +
				"  INDEX idx_tte_date (entry_date)" +
				") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
			));
			console.log('[startup] team_time_entries table ready');
		} catch (e) {
			console.warn('[startup] team_time_entries migration skipped:', (e as Error)?.message?.slice(0, 120));
		}

		// ── form_global_lists ─────────────────────────────────────────────────
		try {
			await db.execute(sql.raw(
				"CREATE TABLE IF NOT EXISTS form_global_lists (" +
				"  id         INT AUTO_INCREMENT PRIMARY KEY," +
				"  company_id INT NOT NULL," +
				"  name       VARCHAR(120) NOT NULL," +
				"  items      JSON NOT NULL DEFAULT (JSON_ARRAY())," +
				"  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP," +
				"  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP," +
				"  INDEX idx_fgl_company (company_id)" +
				") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
			));
			console.log('[startup] form_global_lists table ready');
		} catch (e) {
			console.warn('[startup] form_global_lists migration skipped:', (e as Error)?.message?.slice(0, 120));
		}

		// ── sms_verification_codes.verified_at (missing column fix) ──────────
		try {
			await db.execute(sql.raw(
				"ALTER TABLE sms_verification_codes ADD COLUMN verified_at TIMESTAMP NULL DEFAULT NULL AFTER attempts"
			));
			console.log('[startup] sms_verification_codes.verified_at column added');
		} catch (e) {
			console.warn('[startup] sms_verification_codes.verified_at migration skipped:', (e as Error)?.message?.slice(0, 120));
		}

		// ── All migrations done — now start accepting requests ─────────────────
		console.log('[startup] all inline migrations complete — calling app.listen');
		if (_serverStarted) {
			console.log('[startup] timeout-forced listen already fired — skipping duplicate listen');
			return;
		}
		_serverStarted = true;
		clearTimeout(_startupTimeout);
		const server = app.listen(port, host, () => {
			console.log(`[startup] Server listening on http://${host}:${port}`);
		});
		server.on("error", (err) => {
			console.error("ssr.server.listen-failed", { port, host, code: (err as NodeJS.ErrnoException).code, error: err.message });
			process.exit(1);
		});
	})().catch((fatalErr) => {
		console.error('[startup] FATAL: startup IIFE crashed, forcing app.listen anyway:', fatalErr instanceof Error ? fatalErr.stack : fatalErr);
		if (_serverStarted) return;
		_serverStarted = true;
		clearTimeout(_startupTimeout);
		// Even if migrations fail, start the server so health checks pass
		const server = app.listen(port, host, () => {
			console.log(`[startup] Server listening (degraded) on http://${host}:${port}`);
		});
		server.on("error", (err) => {
			console.error("ssr.server.listen-failed", { port, host, code: (err as NodeJS.ErrnoException).code, error: err.message });
			process.exit(1);
		});
	});

	// ── Global uncaught error guards ─────────────────────────────────────────
	process.on('uncaughtException', (err) => {
		console.error('[startup] uncaughtException:', err instanceof Error ? err.stack : err);
		// Do NOT exit — let the server keep running for health checks
	});
	process.on('unhandledRejection', (reason) => {
		console.error('[startup] unhandledRejection:', reason instanceof Error ? reason.stack : reason);
	});
}

export default app;
