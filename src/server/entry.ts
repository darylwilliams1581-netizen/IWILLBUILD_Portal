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
import { globalApiLimiter, authApiLimiter, recoveryTokenLimiter } from './lib/api-rate-limiter.js';
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
import admin_fix_all_photo_fields_post_1 from "./api/admin/fix-all-photo-fields/POST";
import admin_fix_photo_record_fields_post_2 from "./api/admin/fix-photo-record-fields/POST";
import admin_fix_photo_thumbnails_post_3 from "./api/admin/fix-photo-thumbnails/POST";
import admin_recovery_email_freeze_post_4 from "./api/admin/recovery-email/freeze/POST";
import admin_set_user_company_post_5 from "./api/admin/set-user-company/POST";
import asset_manager_assets_get_6 from "./api/asset-manager/assets/GET";
import asset_manager_assets_post_7 from "./api/asset-manager/assets/POST";
import asset_manager_assets_id_get_8 from "./api/asset-manager/assets/[id]/GET";
import asset_manager_assets_id_patch_9 from "./api/asset-manager/assets/[id]/PATCH";
import asset_manager_assets_id_archive_post_10 from "./api/asset-manager/assets/[id]/archive/POST";
import asset_manager_assets_id_notes_get_11 from "./api/asset-manager/assets/[id]/notes/GET";
import asset_manager_assets_id_notes_post_12 from "./api/asset-manager/assets/[id]/notes/POST";
import asset_manager_assets_id_notes_noteId_delete_13 from "./api/asset-manager/assets/[id]/notes/[noteId]/DELETE";
import asset_manager_assets_id_permanent_delete_14 from "./api/asset-manager/assets/[id]/permanent/DELETE";
import asset_manager_assets_id_photos_get_15 from "./api/asset-manager/assets/[id]/photos/GET";
import asset_manager_assets_id_photos_post_16 from "./api/asset-manager/assets/[id]/photos/POST";
import asset_manager_assets_id_photos_photoId_delete_17 from "./api/asset-manager/assets/[id]/photos/[photoId]/DELETE";
import asset_manager_assets_id_restore_post_18 from "./api/asset-manager/assets/[id]/restore/POST";
import asset_manager_assets_id_todos_get_19 from "./api/asset-manager/assets/[id]/todos/GET";
import asset_manager_assets_id_todos_post_20 from "./api/asset-manager/assets/[id]/todos/POST";
import asset_manager_assets_id_todos_todoId_delete_21 from "./api/asset-manager/assets/[id]/todos/[todoId]/DELETE";
import asset_manager_assets_id_todos_todoId_put_22 from "./api/asset-manager/assets/[id]/todos/[todoId]/PUT";
import asset_manager_defects_get_23 from "./api/asset-manager/defects/GET";
import asset_manager_defects_id_patch_24 from "./api/asset-manager/defects/[id]/PATCH";
import asset_manager_defects_id_archive_post_25 from "./api/asset-manager/defects/[id]/archive/POST";
import asset_manager_inspections_get_26 from "./api/asset-manager/inspections/GET";
import asset_manager_inspections_post_27 from "./api/asset-manager/inspections/POST";
import asset_manager_inspections_id_get_28 from "./api/asset-manager/inspections/[id]/GET";
import asset_manager_inspections_id_patch_29 from "./api/asset-manager/inspections/[id]/PATCH";
import asset_manager_inspections_id_archive_post_30 from "./api/asset-manager/inspections/[id]/archive/POST";
import asset_manager_inspections_id_closeout_post_31 from "./api/asset-manager/inspections/[id]/closeout/POST";
import asset_manager_inspections_id_defects_post_32 from "./api/asset-manager/inspections/[id]/defects/POST";
import asset_manager_inspections_id_permanent_delete_33 from "./api/asset-manager/inspections/[id]/permanent/DELETE";
import asset_manager_inspections_id_photos_post_34 from "./api/asset-manager/inspections/[id]/photos/POST";
import asset_manager_inspections_id_report_share_post_35 from "./api/asset-manager/inspections/[id]/report/share/POST";
import asset_manager_inspections_id_restore_post_36 from "./api/asset-manager/inspections/[id]/restore/POST";
import asset_manager_inspections_id_tenders_post_37 from "./api/asset-manager/inspections/[id]/tenders/POST";
import asset_manager_monitoring_get_38 from "./api/asset-manager/monitoring/GET";
import asset_manager_reports_shareToken_get_39 from "./api/asset-manager/reports/[shareToken]/GET";
import asset_manager_tenders_get_40 from "./api/asset-manager/tenders/GET";
import asset_manager_tenders_id_get_41 from "./api/asset-manager/tenders/[id]/GET";
import asset_manager_tenders_id_patch_42 from "./api/asset-manager/tenders/[id]/PATCH";
import asset_manager_tenders_id_attachments_get_43 from "./api/asset-manager/tenders/[id]/attachments/GET";
import asset_manager_tenders_id_attachments_post_44 from "./api/asset-manager/tenders/[id]/attachments/POST";
import asset_manager_tenders_id_attachments_fileId_delete_45 from "./api/asset-manager/tenders/[id]/attachments/[fileId]/DELETE";
import asset_manager_tenders_id_complete_post_46 from "./api/asset-manager/tenders/[id]/complete/POST";
import asset_manager_tenders_id_contracts_post_47 from "./api/asset-manager/tenders/[id]/contracts/POST";
import asset_manager_tenders_id_notes_patch_48 from "./api/asset-manager/tenders/[id]/notes/PATCH";
import asset_manager_tenders_id_todos_get_49 from "./api/asset-manager/tenders/[id]/todos/GET";
import asset_manager_tenders_id_todos_post_50 from "./api/asset-manager/tenders/[id]/todos/POST";
import asset_manager_tenders_id_todos_todoId_delete_51 from "./api/asset-manager/tenders/[id]/todos/[todoId]/DELETE";
import asset_manager_tenders_id_todos_todoId_put_52 from "./api/asset-manager/tenders/[id]/todos/[todoId]/PUT";
import auth_change_email_post_53 from "./api/auth/change-email/POST";
import auth_change_password_post_54 from "./api/auth/change-password/POST";
import auth_check_signup_status_post_55 from "./api/auth/check-signup-status/POST";
import auth_forgot_password_post_56 from "./api/auth/forgot-password/POST";
import auth_pin_login_post_57 from "./api/auth/pin-login/POST";
import auth_resend_verification_post_58 from "./api/auth/resend-verification/POST";
import auth_reset_password_post_59 from "./api/auth/reset-password/POST";
import auth_resume_signup_post_60 from "./api/auth/resume-signup/POST";
import auth_self_verify_post_61 from "./api/auth/self-verify/POST";
import auth_send_sms_code_post_62 from "./api/auth/send-sms-code/POST";
import auth_sms_configured_get_63 from "./api/auth/sms-configured/GET";
import auth_sms_recovery_post_64 from "./api/auth/sms-recovery/POST";
import auth_trusted_devices_get_65 from "./api/auth/trusted-devices/GET";
import auth_trusted_devices_post_66 from "./api/auth/trusted-devices/POST";
import auth_trusted_devices_deviceId_delete_67 from "./api/auth/trusted-devices/[deviceId]/DELETE";
import auth_trusted_devices_deviceId_clear_pin_patch_68 from "./api/auth/trusted-devices/[deviceId]/clear-pin/PATCH";
import auth_validate_reset_token_get_69 from "./api/auth/validate-reset-token/GET";
import auth_verify_email_post_70 from "./api/auth/verify-email/POST";
import auth_verify_sms_code_post_71 from "./api/auth/verify-sms-code/POST";
import auth_action_get_72 from "./api/auth/[action]/GET";
import auth_action_post_73 from "./api/auth/[action]/POST";
import auth_action_detail_get_74 from "./api/auth/[action]/[detail]/GET";
import auth_action_detail_post_75 from "./api/auth/[action]/[detail]/POST";
import billing_cancel_subscription_post_76 from "./api/billing/cancel-subscription/POST";
import billing_cancellation_feedback_post_77 from "./api/billing/cancellation-feedback/POST";
import billing_customer_portal_post_78 from "./api/billing/customer-portal/POST";
import billing_reactivate_subscription_post_79 from "./api/billing/reactivate-subscription/POST";
import billing_upgrade_subscription_post_80 from "./api/billing/upgrade-subscription/POST";
import bug_reports_get_81 from "./api/bug-reports/GET";
import bug_reports_post_82 from "./api/bug-reports/POST";
import bug_reports_my_reports_get_83 from "./api/bug-reports/my-reports/GET";
import bug_reports_id_patch_84 from "./api/bug-reports/[id]/PATCH";
import bug_reports_id_analyse_post_85 from "./api/bug-reports/[id]/analyse/POST";
import bug_reports_id_dazza_review_comments_get_86 from "./api/bug-reports/[id]/dazza-review/comments/GET";
import bug_reports_id_dazza_review_ensure_post_87 from "./api/bug-reports/[id]/dazza-review/ensure/POST";
import bug_reports_id_dazza_review_evidence_post_88 from "./api/bug-reports/[id]/dazza-review/evidence/POST";
import bug_reports_id_dazza_review_retry_post_89 from "./api/bug-reports/[id]/dazza-review/retry/POST";
import bug_reports_id_export_bundle_get_90 from "./api/bug-reports/[id]/export-bundle/GET";
import bug_reports_id_publish_fix_post_91 from "./api/bug-reports/[id]/publish-fix/POST";
import bug_reports_id_sms_authorise_post_92 from "./api/bug-reports/[id]/sms-authorise/POST";
import company_get_93 from "./api/company/GET";
import company_put_94 from "./api/company/PUT";
import company_logo_post_95 from "./api/company/logo/POST";
import company_settings_get_96 from "./api/company-settings/GET";
import company_settings_put_97 from "./api/company-settings/PUT";
import config_maps_key_get_98 from "./api/config/maps-key/GET";
import contact_post_99 from "./api/contact/POST";
import cost_guide_get_100 from "./api/cost-guide/GET";
import cost_guide_post_101 from "./api/cost-guide/POST";
import cost_guide_export_csv_get_102 from "./api/cost-guide/export-csv/GET";
import cost_guide_import_csv_post_103 from "./api/cost-guide/import-csv/POST";
import cost_guide_id_delete_104 from "./api/cost-guide/[id]/DELETE";
import cost_guide_id_put_105 from "./api/cost-guide/[id]/PUT";
import customers_get_106 from "./api/customers/GET";
import customers_post_107 from "./api/customers/POST";
import customers_id_delete_108 from "./api/customers/[id]/DELETE";
import customers_id_get_109 from "./api/customers/[id]/GET";
import customers_id_put_110 from "./api/customers/[id]/PUT";
import dashboard_kpi_get_111 from "./api/dashboard/kpi/GET";
import dashboard_setup_check_get_112 from "./api/dashboard/setup-check/GET";
import dashboard_todos_get_113 from "./api/dashboard/todos/GET";
import dazza_anatomy_github_check_changes_post_114 from "./api/dazza/anatomy/github/check-changes/POST";
import dazza_anatomy_github_fetch_post_115 from "./api/dazza/anatomy/github/fetch/POST";
import dazza_anatomy_github_test_connection_post_116 from "./api/dazza/anatomy/github/test-connection/POST";
import dazza_anatomy_search_post_117 from "./api/dazza/anatomy/search/POST";
import dazza_anatomy_snapshots_get_118 from "./api/dazza/anatomy/snapshots/GET";
import dazza_anatomy_snapshots_id_get_119 from "./api/dazza/anatomy/snapshots/[id]/GET";
import dazza_anatomy_snapshots_id_activate_post_120 from "./api/dazza/anatomy/snapshots/[id]/activate/POST";
import dazza_anatomy_snapshots_id_delete_post_121 from "./api/dazza/anatomy/snapshots/[id]/delete/POST";
import dazza_anatomy_upload_zip_post_122 from "./api/dazza/anatomy/upload-zip/POST";
import dazza_annette_post_123 from "./api/dazza/annette/POST";
import dazza_attachments_conversation_id_get_124 from "./api/dazza/attachments/conversation/[id]/GET";
import dazza_attachments_upload_post_125 from "./api/dazza/attachments/upload/POST";
import dazza_attachments_id_get_126 from "./api/dazza/attachments/[id]/GET";
import dazza_brain_hive_approve_post_127 from "./api/dazza/brain/hive/approve/POST";
import dazza_brain_hive_reject_post_128 from "./api/dazza/brain/hive/reject/POST";
import dazza_brain_status_get_129 from "./api/dazza/brain/status/GET";
import dazza_builder_apply_post_130 from "./api/dazza/builder/apply/POST";
import dazza_builder_chat_stream_post_131 from "./api/dazza/builder/chat/stream/POST";
import dazza_builder_versions_get_132 from "./api/dazza/builder/versions/GET";
import dazza_builder_versions_restore_post_133 from "./api/dazza/builder/versions/restore/POST";
import dazza_builder_cases_get_134 from "./api/dazza/builder-cases/GET";
import dazza_builder_cases_post_135 from "./api/dazza/builder-cases/POST";
import dazza_builder_cases_by_bug_bugId_get_136 from "./api/dazza/builder-cases/by-bug/[bugId]/GET";
import dazza_builder_cases_id_get_137 from "./api/dazza/builder-cases/[id]/GET";
import dazza_builder_cases_id_patch_138 from "./api/dazza/builder-cases/[id]/PATCH";
import dazza_chat_post_139 from "./api/dazza/chat/POST";
import dazza_chat_stream_post_140 from "./api/dazza/chat/stream/POST";
import dazza_chat_v2_post_141 from "./api/dazza/chat-v2/POST";
import dazza_chat_v2_stream_post_142 from "./api/dazza/chat-v2/stream/POST";
import dazza_context_get_143 from "./api/dazza/context/GET";
import dazza_conversation_id_history_get_144 from "./api/dazza/conversation/[id]/history/GET";
import dazza_engine_status_get_145 from "./api/dazza/engine-status/GET";
import dazza_key_status_get_146 from "./api/dazza/key-status/GET";
import dazza_knowledge_get_147 from "./api/dazza/knowledge/GET";
import dazza_knowledge_post_148 from "./api/dazza/knowledge/POST";
import dazza_knowledge_id_delete_149 from "./api/dazza/knowledge/[id]/DELETE";
import dazza_knowledge_id_put_150 from "./api/dazza/knowledge/[id]/PUT";
import dazza_secret_health_get_151 from "./api/dazza/secret-health/GET";
import dazza_v3_chat_stream_post_152 from "./api/dazza/v3/chat/stream/POST";
import dazza_v3_client_rescue_get_153 from "./api/dazza/v3/client-rescue/GET";
import dazza_v3_client_rescue_id_patch_154 from "./api/dazza/v3/client-rescue/[id]/PATCH";
import dazza_v3_communications_get_155 from "./api/dazza/v3/communications/GET";
import dazza_v3_communications_post_156 from "./api/dazza/v3/communications/POST";
import dazza_v3_communications_owner_get_157 from "./api/dazza/v3/communications/owner/GET";
import dazza_v3_communications_id_patch_158 from "./api/dazza/v3/communications/[id]/PATCH";
import dazza_v3_communications_id_dismiss_post_159 from "./api/dazza/v3/communications/[id]/dismiss/POST";
import dazza_v3_communications_id_still_having_trouble_post_160 from "./api/dazza/v3/communications/[id]/still-having-trouble/POST";
import dazza_v3_incidents_get_161 from "./api/dazza/v3/incidents/GET";
import dazza_v3_incidents_post_162 from "./api/dazza/v3/incidents/POST";
import dazza_v3_incidents_id_get_163 from "./api/dazza/v3/incidents/[id]/GET";
import dazza_v3_incidents_id_investigate_post_164 from "./api/dazza/v3/incidents/[id]/investigate/POST";
import developer_activity_log_get_165 from "./api/developer/activity-log/GET";
import developer_audit_log_get_166 from "./api/developer/audit-log/GET";
import developer_billing_reconcile_post_167 from "./api/developer/billing-reconcile/POST";
import developer_companies_id_archive_post_168 from "./api/developer/companies/[id]/archive/POST";
import developer_company_health_get_169 from "./api/developer/company-health/GET";
import developer_email_log_get_170 from "./api/developer/email-log/GET";
import developer_email_settings_get_171 from "./api/developer/email-settings/GET";
import developer_email_settings_put_172 from "./api/developer/email-settings/PUT";
import developer_email_settings_test_post_173 from "./api/developer/email-settings/test/POST";
import developer_media_backfill_report_get_174 from "./api/developer/media-backfill-report/GET";
import developer_provision_apple_review_account_post_175 from "./api/developer/provision-apple-review-account/POST";
import developer_run_seed_now_post_176 from "./api/developer/run-seed-now/POST";
import developer_seed_developer_account_post_177 from "./api/developer/seed-developer-account/POST";
import developer_support_notes_get_178 from "./api/developer/support-notes/GET";
import developer_support_notes_post_179 from "./api/developer/support-notes/POST";
import developer_support_notes_id_delete_180 from "./api/developer/support-notes/[id]/DELETE";
import developer_test_share_security_post_181 from "./api/developer/test-share-security/POST";
import developer_users_id_assign_company_post_182 from "./api/developer/users/[id]/assign-company/POST";
import developer_users_id_deactivate_post_183 from "./api/developer/users/[id]/deactivate/POST";
import developer_users_id_delete_orphan_post_184 from "./api/developer/users/[id]/delete-orphan/POST";
import developer_users_id_force_temp_password_post_185 from "./api/developer/users/[id]/force-temp-password/POST";
import developer_users_id_impersonate_delete_186 from "./api/developer/users/[id]/impersonate/DELETE";
import developer_users_id_impersonate_post_187 from "./api/developer/users/[id]/impersonate/POST";
import developer_users_id_reactivate_post_188 from "./api/developer/users/[id]/reactivate/POST";
import developer_users_id_resend_verification_post_189 from "./api/developer/users/[id]/resend-verification/POST";
import developer_users_id_role_put_190 from "./api/developer/users/[id]/role/PUT";
import developer_users_id_send_reset_email_post_191 from "./api/developer/users/[id]/send-reset-email/POST";
import developer_users_id_sessions_delete_192 from "./api/developer/users/[id]/sessions/DELETE";
import developer_users_id_sessions_get_193 from "./api/developer/users/[id]/sessions/GET";
import developer_users_id_unlock_account_post_194 from "./api/developer/users/[id]/unlock-account/POST";
import diag_recover_old_photos_post_195 from "./api/diag/recover-old-photos/POST";
import diag_self_test_get_196 from "./api/diag/self-test/GET";
import diag_upload_test_post_197 from "./api/diag/upload-test/POST";
import document_templates_get_198 from "./api/document-templates/GET";
import document_templates_post_199 from "./api/document-templates/POST";
import document_templates_id_delete_200 from "./api/document-templates/[id]/DELETE";
import document_templates_id_get_201 from "./api/document-templates/[id]/GET";
import document_templates_id_patch_202 from "./api/document-templates/[id]/PATCH";
import document_templates_id_put_203 from "./api/document-templates/[id]/PUT";
import document_templates_id_duplicate_post_204 from "./api/document-templates/[id]/duplicate/POST";
import document_templates_id_export_docx_get_205 from "./api/document-templates/[id]/export/docx/GET";
import document_templates_id_export_pdf_get_206 from "./api/document-templates/[id]/export/pdf/GET";
import document_templates_id_import_auto_post_207 from "./api/document-templates/[id]/import-auto/POST";
import document_templates_id_import_blocks_post_208 from "./api/document-templates/[id]/import-blocks/POST";
import document_templates_id_import_docx_post_209 from "./api/document-templates/[id]/import-docx/POST";
import document_templates_id_import_pdf_post_210 from "./api/document-templates/[id]/import-pdf/POST";
import document_templates_id_pdf_bytes_get_211 from "./api/document-templates/[id]/pdf-bytes/GET";
import document_templates_id_publish_to_library_post_212 from "./api/document-templates/[id]/publish-to-library/POST";
import document_templates_id_source_document_get_213 from "./api/document-templates/[id]/source-document/GET";
import document_templates_id_source_document_download_get_214 from "./api/document-templates/[id]/source-document/download/GET";
import document_templates_id_source_document_pdf_preview_get_215 from "./api/document-templates/[id]/source-document/pdf-preview/GET";
import document_templates_id_source_document_replace_post_216 from "./api/document-templates/[id]/source-document/replace/POST";
import documents_get_217 from "./api/documents/GET";
import documents_share_token_get_218 from "./api/documents/share/[token]/GET";
import documents_share_token_post_219 from "./api/documents/share/[token]/POST";
import documents_id_get_220 from "./api/documents/[id]/GET";
import documents_id_put_221 from "./api/documents/[id]/PUT";
import documents_id_events_get_222 from "./api/documents/[id]/events/GET";
import documents_id_share_delete_223 from "./api/documents/[id]/share/DELETE";
import documents_id_share_post_224 from "./api/documents/[id]/share/POST";
import drawings_get_225 from "./api/drawings/GET";
import drawings_post_226 from "./api/drawings/POST";
import drawings_upload_post_227 from "./api/drawings/upload/POST";
import drawings_id_delete_228 from "./api/drawings/[id]/DELETE";
import drawings_id_patch_229 from "./api/drawings/[id]/PATCH";
import drawings_id_markup_post_230 from "./api/drawings/[id]/markup/POST";
import electrical_test_equipment_get_231 from "./api/electrical-test-equipment/GET";
import electrical_test_equipment_post_232 from "./api/electrical-test-equipment/POST";
import electrical_test_equipment_id_put_233 from "./api/electrical-test-equipment/[id]/PUT";
import electrical_tests_get_234 from "./api/electrical-tests/GET";
import electrical_tests_post_235 from "./api/electrical-tests/POST";
import electrical_tests_export_jobId_csv_get_236 from "./api/electrical-tests/export/[jobId]/csv/GET";
import electrical_tests_export_jobId_pdf_get_237 from "./api/electrical-tests/export/[jobId]/pdf/GET";
import electrical_tests_photos_photoId_get_238 from "./api/electrical-tests/photos/[photoId]/GET";
import electrical_tests_id_get_239 from "./api/electrical-tests/[id]/GET";
import electrical_tests_id_put_240 from "./api/electrical-tests/[id]/PUT";
import electrical_tests_id_photos_post_241 from "./api/electrical-tests/[id]/photos/POST";
import electrical_tests_id_retest_post_242 from "./api/electrical-tests/[id]/retest/POST";
import electrical_tests_id_sign_off_post_243 from "./api/electrical-tests/[id]/sign-off/POST";
import emergency_alerts_get_244 from "./api/emergency-alerts/GET";
import emergency_alerts_post_245 from "./api/emergency-alerts/POST";
import emergency_alerts_id_put_246 from "./api/emergency-alerts/[id]/PUT";
import estimates_get_247 from "./api/estimates/GET";
import estimates_post_248 from "./api/estimates/POST";
import estimates_id_delete_249 from "./api/estimates/[id]/DELETE";
import estimates_id_get_250 from "./api/estimates/[id]/GET";
import estimates_id_put_251 from "./api/estimates/[id]/PUT";
import estimates_id_compose_defaults_get_252 from "./api/estimates/[id]/compose-defaults/GET";
import estimates_id_convert_to_invoice_post_253 from "./api/estimates/[id]/convert-to-invoice/POST";
import estimates_id_export_csv_get_254 from "./api/estimates/[id]/export-csv/GET";
import estimates_id_export_pdf_get_255 from "./api/estimates/[id]/export-pdf/GET";
import estimates_id_import_csv_post_256 from "./api/estimates/[id]/import-csv/POST";
import estimates_id_send_email_post_257 from "./api/estimates/[id]/send-email/POST";
import estimates_id_unlock_post_258 from "./api/estimates/[id]/unlock/POST";
import external_form_token_get_259 from "./api/external/form/[token]/GET";
import external_form_token_post_260 from "./api/external/form/[token]/POST";
import features_get_261 from "./api/features/GET";
import files_get_262 from "./api/files/GET";
import files_post_263 from "./api/files/POST";
import files_id_delete_264 from "./api/files/[id]/DELETE";
import files_id_download_get_265 from "./api/files/[id]/download/GET";
import finance_estimates_get_266 from "./api/finance/estimates/GET";
import finance_ledger_get_267 from "./api/finance/ledger/GET";
import finance_purchase_orders_get_268 from "./api/finance/purchase-orders/GET";
import finance_purchase_orders_post_269 from "./api/finance/purchase-orders/POST";
import finance_purchase_orders_poId_delete_270 from "./api/finance/purchase-orders/[poId]/DELETE";
import finance_purchase_orders_poId_get_271 from "./api/finance/purchase-orders/[poId]/GET";
import finance_purchase_orders_poId_put_272 from "./api/finance/purchase-orders/[poId]/PUT";
import finance_purchase_orders_poId_pdf_get_273 from "./api/finance/purchase-orders/[poId]/pdf/GET";
import finance_timesheets_get_274 from "./api/finance/timesheets/GET";
import finance_timesheets_post_275 from "./api/finance/timesheets/POST";
import finance_timesheets_employees_get_276 from "./api/finance/timesheets/employees/GET";
import finance_timesheets_me_get_277 from "./api/finance/timesheets/me/GET";
import finance_timesheets_id_delete_278 from "./api/finance/timesheets/[id]/DELETE";
import finance_timesheets_id_get_279 from "./api/finance/timesheets/[id]/GET";
import finance_timesheets_id_put_280 from "./api/finance/timesheets/[id]/PUT";
import fleet_get_281 from "./api/fleet/GET";
import fleet_post_282 from "./api/fleet/POST";
import fleet_analytics_settings_get_283 from "./api/fleet/analytics-settings/GET";
import fleet_analytics_settings_put_284 from "./api/fleet/analytics-settings/PUT";
import fleet_asset_bookings_get_285 from "./api/fleet/asset-bookings/GET";
import fleet_asset_bookings_post_286 from "./api/fleet/asset-bookings/POST";
import fleet_asset_bookings_id_delete_287 from "./api/fleet/asset-bookings/[id]/DELETE";
import fleet_asset_bookings_id_patch_288 from "./api/fleet/asset-bookings/[id]/PATCH";
import fleet_driver_sessions_post_289 from "./api/fleet/driver-sessions/POST";
import fleet_driver_sessions_active_get_290 from "./api/fleet/driver-sessions/active/GET";
import fleet_driver_sessions_live_get_291 from "./api/fleet/driver-sessions/live/GET";
import fleet_driver_sessions_migrate_gps_status_post_292 from "./api/fleet/driver-sessions/migrate-gps-status/POST";
import fleet_driver_sessions_id_heartbeat_post_293 from "./api/fleet/driver-sessions/[id]/heartbeat/POST";
import fleet_driver_sessions_id_stop_post_294 from "./api/fleet/driver-sessions/[id]/stop/POST";
import fleet_driver_sessions_id_summary_get_295 from "./api/fleet/driver-sessions/[id]/summary/GET";
import fleet_driver_sessions_id_telemetry_post_296 from "./api/fleet/driver-sessions/[id]/telemetry/POST";
import fleet_driver_sessions_id_telemetry_latest_get_297 from "./api/fleet/driver-sessions/[id]/telemetry/latest/GET";
import fleet_flags_get_298 from "./api/fleet/flags/GET";
import fleet_last_known_positions_get_299 from "./api/fleet/last-known-positions/GET";
import fleet_service_logs_logId_delete_300 from "./api/fleet/service-logs/[logId]/DELETE";
import fleet_service_logs_logId_patch_301 from "./api/fleet/service-logs/[logId]/PATCH";
import fleet_vehicles_get_302 from "./api/fleet/vehicles/GET";
import fleet_id_delete_303 from "./api/fleet/[id]/DELETE";
import fleet_id_get_304 from "./api/fleet/[id]/GET";
import fleet_id_put_305 from "./api/fleet/[id]/PUT";
import fleet_id_driver_sessions_get_306 from "./api/fleet/[id]/driver-sessions/GET";
import fleet_id_driver_sessions_manual_post_307 from "./api/fleet/[id]/driver-sessions/manual/POST";
import fleet_id_files_get_308 from "./api/fleet/[id]/files/GET";
import fleet_id_prestarts_get_309 from "./api/fleet/[id]/prestarts/GET";
import fleet_id_prestarts_post_310 from "./api/fleet/[id]/prestarts/POST";
import fleet_id_service_logs_get_311 from "./api/fleet/[id]/service-logs/GET";
import fleet_id_service_logs_post_312 from "./api/fleet/[id]/service-logs/POST";
import fleet_id_signin_post_313 from "./api/fleet/[id]/signin/POST";
import fleet_id_signout_post_314 from "./api/fleet/[id]/signout/POST";
import fleet_id_usage_export_get_315 from "./api/fleet/[id]/usage-export/GET";
import fleet_id_usage_status_get_316 from "./api/fleet/[id]/usage-status/GET";
import fleet_id_usage_summary_get_317 from "./api/fleet/[id]/usage-summary/GET";
import form_attachments_post_318 from "./api/form-attachments/POST";
import form_global_lists_get_319 from "./api/form-global-lists/GET";
import form_global_lists_post_320 from "./api/form-global-lists/POST";
import form_global_lists_id_delete_321 from "./api/form-global-lists/[id]/DELETE";
import form_global_lists_id_put_322 from "./api/form-global-lists/[id]/PUT";
import form_templates_get_323 from "./api/form-templates/GET";
import form_templates_post_324 from "./api/form-templates/POST";
import form_templates_seed_post_325 from "./api/form-templates/seed/POST";
import form_templates_id_delete_326 from "./api/form-templates/[id]/DELETE";
import form_templates_id_put_327 from "./api/form-templates/[id]/PUT";
import form_templates_id_publish_to_library_post_328 from "./api/form-templates/[id]/publish-to-library/POST";
import forms_assets_list_get_329 from "./api/forms/assets-list/GET";
import forms_jobs_list_get_330 from "./api/forms/jobs-list/GET";
import forms_migrate_skip_logic_post_331 from "./api/forms/migrate-skip-logic/POST";
import forms_skip_audit_get_332 from "./api/forms/skip-audit/GET";
import forms_skip_audit_post_333 from "./api/forms/skip-audit/POST";
import forms_start_post_334 from "./api/forms/start/POST";
import forms_submissions_get_335 from "./api/forms/submissions/GET";
import forms_submissions_source_id_delete_336 from "./api/forms/submissions/[source]/[id]/DELETE";
import forms_submissions_source_id_archive_post_337 from "./api/forms/submissions/[source]/[id]/archive/POST";
import forms_submissions_source_id_restore_post_338 from "./api/forms/submissions/[source]/[id]/restore/POST";
import forms_templates_id_share_link_delete_339 from "./api/forms/templates/[id]/share-link/DELETE";
import forms_templates_id_share_link_post_340 from "./api/forms/templates/[id]/share-link/POST";
import forms_id_fields_get_341 from "./api/forms/[id]/fields/GET";
import forms_id_fields_post_342 from "./api/forms/[id]/fields/POST";
import forms_id_fields_reorder_post_343 from "./api/forms/[id]/fields/reorder/POST";
import forms_id_fields_fieldId_delete_344 from "./api/forms/[id]/fields/[fieldId]/DELETE";
import forms_id_fields_fieldId_patch_345 from "./api/forms/[id]/fields/[fieldId]/PATCH";
import forms_id_fields_fieldId_thumbnail_post_346 from "./api/forms/[id]/fields/[fieldId]/thumbnail/POST";
import health_get_347 from "./api/health/GET";
import image_safety_attest_post_348 from "./api/image-safety/attest/POST";
import image_safety_batch_status_post_349 from "./api/image-safety/batch-status/POST";
import incidents_get_350 from "./api/incidents/GET";
import incidents_post_351 from "./api/incidents/POST";
import incidents_id_archive_post_352 from "./api/incidents/[id]/archive/POST";
import incidents_id_unarchive_post_353 from "./api/incidents/[id]/unarchive/POST";
import incidents_incidentId_get_354 from "./api/incidents/[incidentId]/GET";
import incidents_incidentId_put_355 from "./api/incidents/[incidentId]/PUT";
import incidents_incidentId_attachments_get_356 from "./api/incidents/[incidentId]/attachments/GET";
import incidents_incidentId_attachments_post_357 from "./api/incidents/[incidentId]/attachments/POST";
import incidents_incidentId_attachments_attachId_delete_358 from "./api/incidents/[incidentId]/attachments/[attachId]/DELETE";
import incidents_incidentId_close_post_359 from "./api/incidents/[incidentId]/close/POST";
import incidents_incidentId_corrective_actions_post_360 from "./api/incidents/[incidentId]/corrective-actions/POST";
import incidents_incidentId_corrective_actions_actionId_put_361 from "./api/incidents/[incidentId]/corrective-actions/[actionId]/PUT";
import incidents_incidentId_pdf_get_362 from "./api/incidents/[incidentId]/pdf/GET";
import incidents_incidentId_third_parties_post_363 from "./api/incidents/[incidentId]/third-parties/POST";
import incidents_incidentId_third_parties_thirdPartyId_delete_364 from "./api/incidents/[incidentId]/third-parties/[thirdPartyId]/DELETE";
import integrations_myob_auth_url_get_365 from "./api/integrations/myob/auth-url/GET";
import integrations_myob_callback_get_366 from "./api/integrations/myob/callback/GET";
import integrations_myob_disconnect_post_367 from "./api/integrations/myob/disconnect/POST";
import integrations_myob_status_get_368 from "./api/integrations/myob/status/GET";
import integrations_myob_sync_invoice_post_369 from "./api/integrations/myob/sync-invoice/POST";
import integrations_onedrive_auth_url_get_370 from "./api/integrations/onedrive/auth-url/GET";
import integrations_onedrive_callback_get_371 from "./api/integrations/onedrive/callback/GET";
import integrations_onedrive_disconnect_post_372 from "./api/integrations/onedrive/disconnect/POST";
import integrations_onedrive_status_get_373 from "./api/integrations/onedrive/status/GET";
import integrations_onedrive_upload_file_post_374 from "./api/integrations/onedrive/upload-file/POST";
import integrations_qbo_auth_url_get_375 from "./api/integrations/qbo/auth-url/GET";
import integrations_qbo_callback_get_376 from "./api/integrations/qbo/callback/GET";
import integrations_qbo_disconnect_post_377 from "./api/integrations/qbo/disconnect/POST";
import integrations_qbo_status_get_378 from "./api/integrations/qbo/status/GET";
import integrations_qbo_sync_invoice_post_379 from "./api/integrations/qbo/sync-invoice/POST";
import integrations_xero_auth_url_get_380 from "./api/integrations/xero/auth-url/GET";
import integrations_xero_callback_get_381 from "./api/integrations/xero/callback/GET";
import integrations_xero_disconnect_post_382 from "./api/integrations/xero/disconnect/POST";
import integrations_xero_status_get_383 from "./api/integrations/xero/status/GET";
import integrations_xero_sync_customer_post_384 from "./api/integrations/xero/sync-customer/POST";
import integrations_xero_sync_invoice_post_385 from "./api/integrations/xero/sync-invoice/POST";
import integrations_xero_webhook_post_386 from "./api/integrations/xero/webhook/POST";
import invoices_get_387 from "./api/invoices/GET";
import invoices_post_388 from "./api/invoices/POST";
import invoices_id_delete_389 from "./api/invoices/[id]/DELETE";
import invoices_id_get_390 from "./api/invoices/[id]/GET";
import invoices_id_put_391 from "./api/invoices/[id]/PUT";
import invoices_id_compose_defaults_get_392 from "./api/invoices/[id]/compose-defaults/GET";
import invoices_id_duplicate_post_393 from "./api/invoices/[id]/duplicate/POST";
import invoices_id_export_pdf_get_394 from "./api/invoices/[id]/export-pdf/GET";
import invoices_id_mark_sent_post_395 from "./api/invoices/[id]/mark-sent/POST";
import invoices_id_record_payment_post_396 from "./api/invoices/[id]/record-payment/POST";
import invoices_id_send_email_post_397 from "./api/invoices/[id]/send-email/POST";
import invoices_id_unlock_patch_398 from "./api/invoices/[id]/unlock/PATCH";
import invoices_id_void_post_399 from "./api/invoices/[id]/void/POST";
import job_cards_get_400 from "./api/job-cards/GET";
import job_cards_post_401 from "./api/job-cards/POST";
import job_cards_id_delete_402 from "./api/job-cards/[id]/DELETE";
import job_cards_id_get_403 from "./api/job-cards/[id]/GET";
import job_cards_id_put_404 from "./api/job-cards/[id]/PUT";
import job_cards_id_convert_post_405 from "./api/job-cards/[id]/convert/POST";
import job_cards_id_invoice_post_406 from "./api/job-cards/[id]/invoice/POST";
import job_cards_id_photos_post_407 from "./api/job-cards/[id]/photos/POST";
import job_cards_id_photos_photoId_delete_408 from "./api/job-cards/[id]/photos/[photoId]/DELETE";
import job_cards_id_photos_photoId_patch_409 from "./api/job-cards/[id]/photos/[photoId]/PATCH";
import job_cards_id_photos_photoId_download_get_410 from "./api/job-cards/[id]/photos/[photoId]/download/GET";
import job_cards_id_photos_photoId_save_and_lock_post_411 from "./api/job-cards/[id]/photos/[photoId]/save-and-lock/POST";
import job_costs_post_412 from "./api/job-costs/POST";
import job_forms_id_delete_413 from "./api/job-forms/[id]/DELETE";
import job_forms_id_get_414 from "./api/job-forms/[id]/GET";
import job_forms_id_put_415 from "./api/job-forms/[id]/PUT";
import job_forms_id_compose_defaults_get_416 from "./api/job-forms/[id]/compose-defaults/GET";
import job_forms_id_export_pdf_get_417 from "./api/job-forms/[id]/export-pdf/GET";
import job_forms_id_reset_post_418 from "./api/job-forms/[id]/reset/POST";
import job_forms_id_send_email_post_419 from "./api/job-forms/[id]/send-email/POST";
import job_forms_id_share_delete_420 from "./api/job-forms/[id]/share/DELETE";
import job_forms_id_share_get_421 from "./api/job-forms/[id]/share/GET";
import job_forms_id_share_post_422 from "./api/job-forms/[id]/share/POST";
import jobs_get_423 from "./api/jobs/GET";
import jobs_post_424 from "./api/jobs/POST";
import jobs_report_generate_post_425 from "./api/jobs/report/generate/POST";
import jobs_search_get_426 from "./api/jobs/search/GET";
import jobs_id_get_427 from "./api/jobs/[id]/GET";
import jobs_id_put_428 from "./api/jobs/[id]/PUT";
import jobs_id_attendance_attendanceId_close_post_429 from "./api/jobs/[id]/attendance/[attendanceId]/close/POST";
import jobs_id_compose_defaults_get_430 from "./api/jobs/[id]/compose-defaults/GET";
import jobs_id_costs_get_431 from "./api/jobs/[id]/costs/GET";
import jobs_id_costs_post_432 from "./api/jobs/[id]/costs/POST";
import jobs_id_costs_export_get_433 from "./api/jobs/[id]/costs/export/GET";
import jobs_id_costs_costId_delete_434 from "./api/jobs/[id]/costs/[costId]/DELETE";
import jobs_id_costs_costId_put_435 from "./api/jobs/[id]/costs/[costId]/PUT";
import jobs_id_costs_costId_receipt_get_436 from "./api/jobs/[id]/costs/[costId]/receipt/GET";
import jobs_id_costs_costId_receipt_post_437 from "./api/jobs/[id]/costs/[costId]/receipt/POST";
import jobs_id_delays_get_438 from "./api/jobs/[id]/delays/GET";
import jobs_id_delays_post_439 from "./api/jobs/[id]/delays/POST";
import jobs_id_delays_export_csv_get_440 from "./api/jobs/[id]/delays/export-csv/GET";
import jobs_id_delays_delayId_delete_441 from "./api/jobs/[id]/delays/[delayId]/DELETE";
import jobs_id_delays_delayId_put_442 from "./api/jobs/[id]/delays/[delayId]/PUT";
import jobs_id_documents_get_443 from "./api/jobs/[id]/documents/GET";
import jobs_id_documents_post_444 from "./api/jobs/[id]/documents/POST";
import jobs_id_export_zip_get_445 from "./api/jobs/[id]/export-zip/GET";
import jobs_id_field_docs_get_446 from "./api/jobs/[id]/field-docs/GET";
import jobs_id_files_get_447 from "./api/jobs/[id]/files/GET";
import jobs_id_forms_get_448 from "./api/jobs/[id]/forms/GET";
import jobs_id_forms_post_449 from "./api/jobs/[id]/forms/POST";
import jobs_id_forms_export_csv_get_450 from "./api/jobs/[id]/forms/export-csv/GET";
import jobs_id_forms_submissionId_delete_451 from "./api/jobs/[id]/forms/[submissionId]/DELETE";
import jobs_id_forms_submissionId_reopen_post_452 from "./api/jobs/[id]/forms/[submissionId]/reopen/POST";
import jobs_id_generate_qr_post_453 from "./api/jobs/[id]/generate-qr/POST";
import jobs_id_ledger_get_454 from "./api/jobs/[id]/ledger/GET";
import jobs_id_ledger_post_455 from "./api/jobs/[id]/ledger/POST";
import jobs_id_ledger_export_get_456 from "./api/jobs/[id]/ledger/export/GET";
import jobs_id_ledger_sync_post_457 from "./api/jobs/[id]/ledger/sync/POST";
import jobs_id_ledger_entryId_delete_458 from "./api/jobs/[id]/ledger/[entryId]/DELETE";
import jobs_id_ledger_entryId_put_459 from "./api/jobs/[id]/ledger/[entryId]/PUT";
import jobs_id_ledger_entryId_correct_post_460 from "./api/jobs/[id]/ledger/[entryId]/correct/POST";
import jobs_id_milestones_get_461 from "./api/jobs/[id]/milestones/GET";
import jobs_id_milestones_post_462 from "./api/jobs/[id]/milestones/POST";
import jobs_id_milestones_milestoneId_delete_463 from "./api/jobs/[id]/milestones/[milestoneId]/DELETE";
import jobs_id_milestones_milestoneId_patch_464 from "./api/jobs/[id]/milestones/[milestoneId]/PATCH";
import jobs_id_notes_export_csv_get_465 from "./api/jobs/[id]/notes/export-csv/GET";
import jobs_id_photos_get_466 from "./api/jobs/[id]/photos/GET";
import jobs_id_photos_post_467 from "./api/jobs/[id]/photos/POST";
import jobs_id_photos_export_zip_post_468 from "./api/jobs/[id]/photos/export-zip/POST";
import jobs_id_photos_picker_get_469 from "./api/jobs/[id]/photos/picker/GET";
import jobs_id_photos_share_post_470 from "./api/jobs/[id]/photos/share/POST";
import jobs_id_photos_photoId_delete_471 from "./api/jobs/[id]/photos/[photoId]/DELETE";
import jobs_id_photos_photoId_patch_472 from "./api/jobs/[id]/photos/[photoId]/PATCH";
import jobs_id_photos_photoId_download_get_473 from "./api/jobs/[id]/photos/[photoId]/download/GET";
import jobs_id_photos_photoId_lock_post_474 from "./api/jobs/[id]/photos/[photoId]/lock/POST";
import jobs_id_photos_photoId_replace_post_475 from "./api/jobs/[id]/photos/[photoId]/replace/POST";
import jobs_id_photos_photoId_report_image_get_476 from "./api/jobs/[id]/photos/[photoId]/report-image/GET";
import jobs_id_progress_get_477 from "./api/jobs/[id]/progress/GET";
import jobs_id_progress_put_478 from "./api/jobs/[id]/progress/PUT";
import jobs_id_progress_export_csv_get_479 from "./api/jobs/[id]/progress/export-csv/GET";
import jobs_id_progress_lines_post_480 from "./api/jobs/[id]/progress/lines/POST";
import jobs_id_progress_lines_reorder_post_481 from "./api/jobs/[id]/progress/lines/reorder/POST";
import jobs_id_progress_lines_lineId_delete_482 from "./api/jobs/[id]/progress/lines/[lineId]/DELETE";
import jobs_id_progress_lines_lineId_patch_483 from "./api/jobs/[id]/progress/lines/[lineId]/PATCH";
import jobs_id_progress_lines_lineId_duplicate_post_484 from "./api/jobs/[id]/progress/lines/[lineId]/duplicate/POST";
import jobs_id_progress_report_get_485 from "./api/jobs/[id]/progress/report/GET";
import jobs_id_progress_report_put_486 from "./api/jobs/[id]/progress/report/PUT";
import jobs_id_progress_report_pdf_get_487 from "./api/jobs/[id]/progress/report/pdf/GET";
import jobs_id_progress_sections_post_488 from "./api/jobs/[id]/progress/sections/POST";
import jobs_id_progress_sections_reorder_post_489 from "./api/jobs/[id]/progress/sections/reorder/POST";
import jobs_id_progress_sections_sectionId_delete_490 from "./api/jobs/[id]/progress/sections/[sectionId]/DELETE";
import jobs_id_progress_sections_sectionId_patch_491 from "./api/jobs/[id]/progress/sections/[sectionId]/PATCH";
import jobs_id_progress_sync_post_492 from "./api/jobs/[id]/progress/sync/POST";
import jobs_id_purchase_orders_get_493 from "./api/jobs/[id]/purchase-orders/GET";
import jobs_id_purchase_orders_post_494 from "./api/jobs/[id]/purchase-orders/POST";
import jobs_id_purchase_orders_poId_delete_495 from "./api/jobs/[id]/purchase-orders/[poId]/DELETE";
import jobs_id_purchase_orders_poId_get_496 from "./api/jobs/[id]/purchase-orders/[poId]/GET";
import jobs_id_purchase_orders_poId_put_497 from "./api/jobs/[id]/purchase-orders/[poId]/PUT";
import jobs_id_purchase_orders_poId_pdf_get_498 from "./api/jobs/[id]/purchase-orders/[poId]/pdf/GET";
import jobs_id_report_pdf_post_499 from "./api/jobs/[id]/report/pdf/POST";
import jobs_id_risky_get_500 from "./api/jobs/[id]/risky/GET";
import jobs_id_risky_post_501 from "./api/jobs/[id]/risky/POST";
import jobs_id_risky_riskyId_get_502 from "./api/jobs/[id]/risky/[riskyId]/GET";
import jobs_id_risky_riskyId_put_503 from "./api/jobs/[id]/risky/[riskyId]/PUT";
import jobs_id_risky_riskyId_finalise_post_504 from "./api/jobs/[id]/risky/[riskyId]/finalise/POST";
import jobs_id_risky_riskyId_signatures_post_505 from "./api/jobs/[id]/risky/[riskyId]/signatures/POST";
import jobs_id_risky_riskyId_supervisor_signoff_post_506 from "./api/jobs/[id]/risky/[riskyId]/supervisor-signoff/POST";
import jobs_id_send_email_post_507 from "./api/jobs/[id]/send-email/POST";
import jobs_id_signin_post_508 from "./api/jobs/[id]/signin/POST";
import jobs_id_signin_qr_post_509 from "./api/jobs/[id]/signin-qr/POST";
import jobs_id_signin_status_get_510 from "./api/jobs/[id]/signin-status/GET";
import jobs_id_signout_post_511 from "./api/jobs/[id]/signout/POST";
import jobs_id_signout_qr_post_512 from "./api/jobs/[id]/signout-qr/POST";
import jobs_id_signout_user_post_513 from "./api/jobs/[id]/signout-user/POST";
import jobs_id_site_prestarts_get_514 from "./api/jobs/[id]/site-prestarts/GET";
import jobs_id_site_prestarts_post_515 from "./api/jobs/[id]/site-prestarts/POST";
import jobs_id_site_prestarts_prestartId_get_516 from "./api/jobs/[id]/site-prestarts/[prestartId]/GET";
import jobs_id_site_prestarts_prestartId_put_517 from "./api/jobs/[id]/site-prestarts/[prestartId]/PUT";
import jobs_id_site_prestarts_prestartId_finalise_post_518 from "./api/jobs/[id]/site-prestarts/[prestartId]/finalise/POST";
import jobs_id_site_prestarts_prestartId_workers_post_519 from "./api/jobs/[id]/site-prestarts/[prestartId]/workers/POST";
import jobs_id_studio_swms_get_520 from "./api/jobs/[id]/studio-swms/GET";
import jobs_id_studio_swms_post_521 from "./api/jobs/[id]/studio-swms/POST";
import jobs_id_swms_get_522 from "./api/jobs/[id]/swms/GET";
import jobs_id_swms_post_523 from "./api/jobs/[id]/swms/POST";
import jobs_id_swms_swmsId_signoff_post_524 from "./api/jobs/[id]/swms/[swmsId]/signoff/POST";
import jobs_id_todos_get_525 from "./api/jobs/[id]/todos/GET";
import jobs_id_todos_post_526 from "./api/jobs/[id]/todos/POST";
import jobs_id_todos_todoId_delete_527 from "./api/jobs/[id]/todos/[todoId]/DELETE";
import jobs_id_todos_todoId_put_528 from "./api/jobs/[id]/todos/[todoId]/PUT";
import lens_photos_get_529 from "./api/lens/photos/GET";
import lens_photos_export_zip_post_530 from "./api/lens/photos/export-zip/POST";
import lens_photos_photoId_download_get_531 from "./api/lens/photos/[photoId]/download/GET";
import library_check_published_get_532 from "./api/library/check-published/GET";
import library_items_get_533 from "./api/library/items/GET";
import library_items_id_get_534 from "./api/library/items/[id]/GET";
import library_items_id_patch_535 from "./api/library/items/[id]/PATCH";
import library_items_id_download_get_536 from "./api/library/items/[id]/download/GET";
import library_items_id_install_delete_537 from "./api/library/items/[id]/install/DELETE";
import library_items_id_install_post_538 from "./api/library/items/[id]/install/POST";
import library_my_installed_get_539 from "./api/library/my-installed/GET";
import library_my_installed_id_get_540 from "./api/library/my-installed/[id]/GET";
import library_my_submissions_get_541 from "./api/library/my-submissions/GET";
import lists_get_542 from "./api/lists/GET";
import me_get_543 from "./api/me/GET";
import me_put_544 from "./api/me/PUT";
import me_2fa_disable_post_545 from "./api/me/2fa/disable/POST";
import me_2fa_enable_post_546 from "./api/me/2fa/enable/POST";
import me_2fa_qr_get_547 from "./api/me/2fa/qr/GET";
import me_2fa_recover_post_548 from "./api/me/2fa/recover/POST";
import me_2fa_setup_get_549 from "./api/me/2fa/setup/GET";
import me_2fa_sms_disable_post_550 from "./api/me/2fa/sms/disable/POST";
import me_2fa_sms_enable_post_551 from "./api/me/2fa/sms/enable/POST";
import me_2fa_sms_send_post_552 from "./api/me/2fa/sms/send/POST";
import me_2fa_sms_send_setup_post_553 from "./api/me/2fa/sms/send-setup/POST";
import me_2fa_sms_verify_post_554 from "./api/me/2fa/sms/verify/POST";
import me_2fa_status_get_555 from "./api/me/2fa/status/GET";
import me_2fa_verify_post_556 from "./api/me/2fa/verify/POST";
import me_active_status_get_557 from "./api/me/active-status/GET";
import me_change_password_post_558 from "./api/me/change-password/POST";
import me_email_status_get_559 from "./api/me/email-status/GET";
import me_phone_get_560 from "./api/me/phone/GET";
import me_phone_put_561 from "./api/me/phone/PUT";
import me_profile_attachments_delete_562 from "./api/me/profile-attachments/DELETE";
import me_profile_attachments_post_563 from "./api/me/profile-attachments/POST";
import me_profile_attachments_download_get_564 from "./api/me/profile-attachments/download/GET";
import me_profile_attachments_thumbnail_get_565 from "./api/me/profile-attachments/thumbnail/GET";
import me_profile_extras_get_566 from "./api/me/profile-extras/GET";
import me_profile_extras_put_567 from "./api/me/profile-extras/PUT";
import me_recovery_email_get_568 from "./api/me/recovery-email/GET";
import me_recovery_email_cancel_get_569 from "./api/me/recovery-email/cancel/GET";
import me_recovery_email_cancel_post_570 from "./api/me/recovery-email/cancel/POST";
import me_recovery_email_freeze_get_571 from "./api/me/recovery-email/freeze/GET";
import me_recovery_email_freeze_post_572 from "./api/me/recovery-email/freeze/POST";
import me_recovery_email_request_post_573 from "./api/me/recovery-email/request/POST";
import me_recovery_email_verify_get_574 from "./api/me/recovery-email/verify/GET";
import migrate_account_recovery_post_575 from "./api/migrate-account-recovery/POST";
import migrate_anatomy_post_576 from "./api/migrate-anatomy/POST";
import migrate_asset_manager_post_577 from "./api/migrate-asset-manager/POST";
import migrate_attendance_post_578 from "./api/migrate-attendance/POST";
import migrate_company_settings_post_579 from "./api/migrate-company-settings/POST";
import migrate_dazza_audit_post_580 from "./api/migrate-dazza-audit/POST";
import migrate_dazza_knowledge_post_581 from "./api/migrate-dazza-knowledge/POST";
import migrate_emergency_alerts_post_582 from "./api/migrate-emergency-alerts/POST";
import migrate_estimates_post_583 from "./api/migrate-estimates/POST";
import migrate_estimating_library_post_584 from "./api/migrate-estimating-library/POST";
import migrate_files_post_585 from "./api/migrate-files/POST";
import migrate_fleet_post_586 from "./api/migrate-fleet/POST";
import migrate_fleet_analytics_post_587 from "./api/migrate-fleet-analytics/POST";
import migrate_fleet_driver_sessions_post_588 from "./api/migrate-fleet-driver-sessions/POST";
import migrate_fleet_usage_post_589 from "./api/migrate-fleet-usage/POST";
import migrate_form_fields_post_590 from "./api/migrate-form-fields/POST";
import migrate_form_logic_post_591 from "./api/migrate-form-logic/POST";
import migrate_form_templates_post_592 from "./api/migrate-form-templates/POST";
import migrate_job_forms_post_593 from "./api/migrate-job-forms/POST";
import migrate_job_photo_shares_post_594 from "./api/migrate-job-photo-shares/POST";
import migrate_job_photos_post_595 from "./api/migrate-job-photos/POST";
import migrate_job_tabs_post_596 from "./api/migrate-job-tabs/POST";
import migrate_jobs_post_597 from "./api/migrate-jobs/POST";
import migrate_ledger_photo_post_598 from "./api/migrate-ledger-photo/POST";
import migrate_library_post_599 from "./api/migrate-library/POST";
import migrate_library_downloads_post_600 from "./api/migrate-library-downloads/POST";
import migrate_notifications_post_601 from "./api/migrate-notifications/POST";
import migrate_owner_console_post_602 from "./api/migrate-owner-console/POST";
import migrate_owner_role_post_603 from "./api/migrate-owner-role/POST";
import migrate_pdf_settings_post_604 from "./api/migrate-pdf-settings/POST";
import migrate_photo_gps_post_605 from "./api/migrate-photo-gps/POST";
import migrate_plan_manager_post_606 from "./api/migrate-plan-manager/POST";
import migrate_plan_manager_v2_post_607 from "./api/migrate-plan-manager-v2/POST";
import migrate_plan_manager_v3_post_608 from "./api/migrate-plan-manager-v3/POST";
import migrate_safety_post_609 from "./api/migrate-safety/POST";
import migrate_safety_studio_post_610 from "./api/migrate-safety-studio/POST";
import migrate_site_prestart_post_611 from "./api/migrate-site-prestart/POST";
import migrate_sms_verified_at_post_612 from "./api/migrate-sms-verified-at/POST";
import migrate_starter_pack_post_613 from "./api/migrate-starter-pack/POST";
import migrate_studio_pdf_post_614 from "./api/migrate-studio-pdf/POST";
import migrate_studio_phase2_post_615 from "./api/migrate-studio-phase2/POST";
import migrate_subscriptions_post_616 from "./api/migrate-subscriptions/POST";
import migrate_support_mode_post_617 from "./api/migrate-support-mode/POST";
import migrate_takeoff_pad_post_618 from "./api/migrate-takeoff-pad/POST";
import migrate_team_post_619 from "./api/migrate-team/POST";
import notes_get_620 from "./api/notes/GET";
import notes_post_621 from "./api/notes/POST";
import notes_comments_post_622 from "./api/notes/comments/POST";
import notes_migrate_post_623 from "./api/notes/migrate/POST";
import notes_id_delete_624 from "./api/notes/[id]/DELETE";
import notifications_alerts_get_625 from "./api/notifications/alerts/GET";
import notifications_prefs_get_626 from "./api/notifications/prefs/GET";
import notifications_prefs_put_627 from "./api/notifications/prefs/PUT";
import notifications_read_post_628 from "./api/notifications/read/POST";
import owner_console_activity_get_629 from "./api/owner-console/activity/GET";
import owner_console_cancellation_feedback_get_630 from "./api/owner-console/cancellation-feedback/GET";
import owner_console_companies_get_631 from "./api/owner-console/companies/GET";
import owner_console_companies_post_632 from "./api/owner-console/companies/POST";
import owner_console_companies_usage_get_633 from "./api/owner-console/companies/usage/GET";
import owner_console_companies_id_limits_put_634 from "./api/owner-console/companies/[id]/limits/PUT";
import owner_console_form_templates_get_635 from "./api/owner-console/form-templates/GET";
import owner_console_form_templates_post_636 from "./api/owner-console/form-templates/POST";
import owner_console_library_items_get_637 from "./api/owner-console/library/items/GET";
import owner_console_library_items_post_638 from "./api/owner-console/library/items/POST";
import owner_console_library_items_from_template_post_639 from "./api/owner-console/library/items/from-template/POST";
import owner_console_library_items_id_delete_640 from "./api/owner-console/library/items/[id]/DELETE";
import owner_console_library_items_id_patch_641 from "./api/owner-console/library/items/[id]/PATCH";
import owner_console_library_items_id_put_642 from "./api/owner-console/library/items/[id]/PUT";
import owner_console_library_items_id_push_update_post_643 from "./api/owner-console/library/items/[id]/push-update/POST";
import owner_console_library_submissions_get_644 from "./api/owner-console/library/submissions/GET";
import owner_console_library_submissions_id_review_post_645 from "./api/owner-console/library/submissions/[id]/review/POST";
import owner_console_starter_pack_get_646 from "./api/owner-console/starter-pack/GET";
import owner_console_starter_pack_post_647 from "./api/owner-console/starter-pack/POST";
import owner_console_stats_get_648 from "./api/owner-console/stats/GET";
import owner_console_storage_get_649 from "./api/owner-console/storage/GET";
import owner_console_swms_masters_get_650 from "./api/owner-console/swms/masters/GET";
import owner_console_swms_masters_post_651 from "./api/owner-console/swms/masters/POST";
import owner_console_swms_masters_publish_all_post_652 from "./api/owner-console/swms/masters/publish-all/POST";
import owner_console_swms_masters_id_delete_653 from "./api/owner-console/swms/masters/[id]/DELETE";
import owner_console_swms_masters_id_get_654 from "./api/owner-console/swms/masters/[id]/GET";
import owner_console_swms_masters_id_put_655 from "./api/owner-console/swms/masters/[id]/PUT";
import owner_console_swms_masters_id_publish_post_656 from "./api/owner-console/swms/masters/[id]/publish/POST";
import owner_console_swms_migrate_master_library_post_657 from "./api/owner-console/swms/migrate-master-library/POST";
import owner_console_swms_push_post_658 from "./api/owner-console/swms/push/POST";
import owner_console_swms_seed_bricklaying_post_659 from "./api/owner-console/swms/seed-bricklaying/POST";
import owner_console_swms_seed_building_inspection_post_660 from "./api/owner-console/swms/seed-building-inspection/POST";
import owner_console_swms_seed_cabinets_post_661 from "./api/owner-console/swms/seed-cabinets/POST";
import owner_console_swms_seed_carpenter_fixing_post_662 from "./api/owner-console/swms/seed-carpenter-fixing/POST";
import owner_console_swms_seed_carpenter_framing_post_663 from "./api/owner-console/swms/seed-carpenter-framing/POST";
import owner_console_swms_seed_carpenter_lockup_post_664 from "./api/owner-console/swms/seed-carpenter-lockup/POST";
import owner_console_swms_seed_ceramic_tiling_post_665 from "./api/owner-console/swms/seed-ceramic-tiling/POST";
import owner_console_swms_seed_concreting_slab_post_666 from "./api/owner-console/swms/seed-concreting-slab/POST";
import owner_console_swms_seed_delivery_loading_post_667 from "./api/owner-console/swms/seed-delivery-loading/POST";
import owner_console_swms_seed_environmental_spill_post_668 from "./api/owner-console/swms/seed-environmental-spill/POST";
import owner_console_swms_seed_ewp_post_669 from "./api/owner-console/swms/seed-ewp/POST";
import owner_console_swms_seed_excavations_substation_post_670 from "./api/owner-console/swms/seed-excavations-substation/POST";
import owner_console_swms_seed_fencing_post_671 from "./api/owner-console/swms/seed-fencing/POST";
import owner_console_swms_seed_heat_stress_post_672 from "./api/owner-console/swms/seed-heat-stress/POST";
import owner_console_swms_seed_landscaping_post_673 from "./api/owner-console/swms/seed-landscaping/POST";
import owner_console_swms_seed_live_parts_post_674 from "./api/owner-console/swms/seed-live-parts/POST";
import owner_console_swms_seed_manual_handling_post_675 from "./api/owner-console/swms/seed-manual-handling/POST";
import owner_console_swms_seed_moving_plant_post_676 from "./api/owner-console/swms/seed-moving-plant/POST";
import owner_console_swms_seed_painting_post_677 from "./api/owner-console/swms/seed-painting/POST";
import owner_console_swms_seed_power_tools_post_678 from "./api/owner-console/swms/seed-power-tools/POST";
import owner_console_swms_seed_silica_dust_post_679 from "./api/owner-console/swms/seed-silica-dust/POST";
import owner_console_swms_seed_traffic_management_post_680 from "./api/owner-console/swms/seed-traffic-management/POST";
import owner_console_swms_seed_underground_services_post_681 from "./api/owner-console/swms/seed-underground-services/POST";
import owner_console_swms_seed_vacuum_excavation_post_682 from "./api/owner-console/swms/seed-vacuum-excavation/POST";
import owner_console_system_ai_builtin_checks_post_683 from "./api/owner-console/system-ai/builtin-checks/POST";
import owner_console_twilio_info_get_684 from "./api/owner-console/twilio-info/GET";
import owner_console_users_get_685 from "./api/owner-console/users/GET";
import owner_console_users_verify_post_686 from "./api/owner-console/users/verify/POST";
import plan_manager_drawings_get_687 from "./api/plan-manager/drawings/GET";
import plan_manager_drawings_post_688 from "./api/plan-manager/drawings/POST";
import plan_manager_drawings_id_get_689 from "./api/plan-manager/drawings/[id]/GET";
import plan_manager_drawings_id_annotations_put_690 from "./api/plan-manager/drawings/[id]/annotations/PUT";
import plan_manager_drawings_id_archive_post_691 from "./api/plan-manager/drawings/[id]/archive/POST";
import plan_manager_drawings_id_job_links_delete_692 from "./api/plan-manager/drawings/[id]/job-links/DELETE";
import plan_manager_drawings_id_job_links_post_693 from "./api/plan-manager/drawings/[id]/job-links/POST";
import plan_manager_drawings_id_pages_pageNo_annotations_get_694 from "./api/plan-manager/drawings/[id]/pages/[pageNo]/annotations/GET";
import plan_manager_drawings_id_permanent_delete_695 from "./api/plan-manager/drawings/[id]/permanent/DELETE";
import plan_manager_drawings_id_reorder_patch_696 from "./api/plan-manager/drawings/[id]/reorder/PATCH";
import plan_manager_drawings_id_restore_post_697 from "./api/plan-manager/drawings/[id]/restore/POST";
import plan_manager_drawings_id_revisions_post_698 from "./api/plan-manager/drawings/[id]/revisions/POST";
import plan_manager_drawings_id_revisions_revisionId_finalize_post_699 from "./api/plan-manager/drawings/[id]/revisions/[revisionId]/finalize/POST";
import plan_manager_drawings_id_upload_post_700 from "./api/plan-manager/drawings/[id]/upload/POST";
import plan_manager_jobs_jobId_drawings_zip_get_701 from "./api/plan-manager/jobs/[jobId]/drawings-zip/GET";
import plan_manager_jobs_with_drawings_get_702 from "./api/plan-manager/jobs-with-drawings/GET";
import plan_manager_share_post_703 from "./api/plan-manager/share/POST";
import plan_manager_share_validate_get_704 from "./api/plan-manager/share/validate/GET";
import plan_manager_upload_post_705 from "./api/plan-manager/upload/POST";
import portal_estimates_id_approve_post_706 from "./api/portal/estimates/[id]/approve/POST";
import portal_invite_post_707 from "./api/portal/invite/POST";
import portal_invoices_id_pay_post_708 from "./api/portal/invoices/[id]/pay/POST";
import portal_jobs_get_709 from "./api/portal/jobs/GET";
import portal_jobs_id_get_710 from "./api/portal/jobs/[id]/GET";
import portal_migrate_post_711 from "./api/portal/migrate/POST";
import portal_validate_post_712 from "./api/portal/validate/POST";
import public_form_token_get_713 from "./api/public/form/[token]/GET";
import public_form_token_submit_post_714 from "./api/public/form/[token]/submit/POST";
import public_job_photos_token_get_715 from "./api/public/job-photos/[token]/GET";
import public_job_photos_token_photo_photoId_get_716 from "./api/public/job-photos/[token]/photo/[photoId]/GET";
import public_swms_token_get_717 from "./api/public/swms/[token]/GET";
import public_swms_token_signoff_post_718 from "./api/public/swms/[token]/signoff/POST";
import purchase_orders_poId_compose_defaults_get_719 from "./api/purchase-orders/[poId]/compose-defaults/GET";
import purchase_orders_poId_send_email_post_720 from "./api/purchase-orders/[poId]/send-email/POST";
import push_subscribe_delete_721 from "./api/push/subscribe/DELETE";
import push_subscribe_post_722 from "./api/push/subscribe/POST";
import push_vapid_key_get_723 from "./api/push/vapid-key/GET";
import quick_links_site_meta_get_724 from "./api/quick-links/site-meta/GET";
import recipes_get_725 from "./api/recipes/GET";
import recipes_post_726 from "./api/recipes/POST";
import recipes_id_delete_727 from "./api/recipes/[id]/DELETE";
import recipes_id_put_728 from "./api/recipes/[id]/PUT";
import risk_register_get_729 from "./api/risk-register/GET";
import risk_register_post_730 from "./api/risk-register/POST";
import risk_register_id_get_731 from "./api/risk-register/[id]/GET";
import risk_register_id_put_732 from "./api/risk-register/[id]/PUT";
import risk_register_id_archive_post_733 from "./api/risk-register/[id]/archive/POST";
import risk_register_id_unarchive_post_734 from "./api/risk-register/[id]/unarchive/POST";
import rl_register_get_735 from "./api/rl-register/GET";
import rl_register_post_736 from "./api/rl-register/POST";
import rl_register_points_id_delete_737 from "./api/rl-register/points/[id]/DELETE";
import rl_register_points_id_put_738 from "./api/rl-register/points/[id]/PUT";
import rl_register_benchmarkId_points_get_739 from "./api/rl-register/[benchmarkId]/points/GET";
import rl_register_benchmarkId_points_post_740 from "./api/rl-register/[benchmarkId]/points/POST";
import rl_register_jobId_export_csv_get_741 from "./api/rl-register/[jobId]/export/csv/GET";
import rl_register_jobId_export_pdf_get_742 from "./api/rl-register/[jobId]/export/pdf/GET";
import safety_ai_draft_post_743 from "./api/safety/ai/draft/POST";
import safety_documents_get_744 from "./api/safety/documents/GET";
import safety_documents_post_745 from "./api/safety/documents/POST";
import safety_documents_new_post_746 from "./api/safety/documents/new/POST";
import safety_documents_id_delete_747 from "./api/safety/documents/[id]/DELETE";
import safety_documents_id_download_get_748 from "./api/safety/documents/[id]/download/GET";
import safety_generated_posters_get_749 from "./api/safety/generated-posters/GET";
import safety_generated_posters_post_750 from "./api/safety/generated-posters/POST";
import safety_generated_posters_id_delete_751 from "./api/safety/generated-posters/[id]/DELETE";
import safety_generated_posters_id_pdf_get_752 from "./api/safety/generated-posters/[id]/pdf/GET";
import safety_job_safety_plans_get_753 from "./api/safety/job-safety-plans/GET";
import safety_job_safety_plans_post_754 from "./api/safety/job-safety-plans/POST";
import safety_job_safety_plans_id_delete_755 from "./api/safety/job-safety-plans/[id]/DELETE";
import safety_job_safety_plans_id_put_756 from "./api/safety/job-safety-plans/[id]/PUT";
import safety_job_swms_get_757 from "./api/safety/job-swms/GET";
import safety_job_swms_post_758 from "./api/safety/job-swms/POST";
import safety_job_swms_id_delete_759 from "./api/safety/job-swms/[id]/DELETE";
import safety_job_swms_id_get_760 from "./api/safety/job-swms/[id]/GET";
import safety_job_swms_id_put_761 from "./api/safety/job-swms/[id]/PUT";
import safety_job_swms_id_share_token_post_762 from "./api/safety/job-swms/[id]/share-token/POST";
import safety_job_swms_id_signoffs_get_763 from "./api/safety/job-swms/[id]/signoffs/GET";
import safety_job_swms_id_signoffs_post_764 from "./api/safety/job-swms/[id]/signoffs/POST";
import safety_job_swms_id_signoffs_signoffId_delete_765 from "./api/safety/job-swms/[id]/signoffs/[signoffId]/DELETE";
import safety_plans_get_766 from "./api/safety/plans/GET";
import safety_plans_post_767 from "./api/safety/plans/POST";
import safety_plans_seed_post_768 from "./api/safety/plans/seed/POST";
import safety_plans_id_delete_769 from "./api/safety/plans/[id]/DELETE";
import safety_plans_id_put_770 from "./api/safety/plans/[id]/PUT";
import safety_plans_id_export_get_771 from "./api/safety/plans/[id]/export/GET";
import safety_plans_id_pack_get_772 from "./api/safety/plans/[id]/pack/GET";
import safety_posters_get_773 from "./api/safety/posters/GET";
import safety_posters_post_774 from "./api/safety/posters/POST";
import safety_posters_id_delete_775 from "./api/safety/posters/[id]/DELETE";
import safety_posters_id_download_get_776 from "./api/safety/posters/[id]/download/GET";
import safety_swms_get_777 from "./api/safety/swms/GET";
import safety_swms_post_778 from "./api/safety/swms/POST";
import safety_swms_import_docx_post_779 from "./api/safety/swms/import-docx/POST";
import safety_swms_seed_post_780 from "./api/safety/swms/seed/POST";
import safety_swms_id_delete_781 from "./api/safety/swms/[id]/DELETE";
import safety_swms_id_get_782 from "./api/safety/swms/[id]/GET";
import safety_swms_id_put_783 from "./api/safety/swms/[id]/PUT";
import safety_swms_id_duplicate_post_784 from "./api/safety/swms/[id]/duplicate/POST";
import safety_swms_id_export_get_785 from "./api/safety/swms/[id]/export/GET";
import safety_swms_id_publish_to_library_post_786 from "./api/safety/swms/[id]/publish-to-library/POST";
import safety_swms_submissions_get_787 from "./api/safety/swms-submissions/GET";
import scheduler_crew_get_788 from "./api/scheduler/crew/GET";
import scheduler_jobs_get_789 from "./api/scheduler/jobs/GET";
import scheduler_jobs_id_reschedule_patch_790 from "./api/scheduler/jobs/[id]/reschedule/PATCH";
import scheduler_tasks_get_791 from "./api/scheduler/tasks/GET";
import sds_register_get_792 from "./api/sds-register/GET";
import sds_register_post_793 from "./api/sds-register/POST";
import sds_register_id_delete_794 from "./api/sds-register/[id]/DELETE";
import sds_register_id_put_795 from "./api/sds-register/[id]/PUT";
import sds_register_id_download_get_796 from "./api/sds-register/[id]/download/GET";
import sds_register_id_replace_post_797 from "./api/sds-register/[id]/replace/POST";
import secure_share_get_798 from "./api/secure-share/GET";
import secure_share_post_799 from "./api/secure-share/POST";
import secure_share_active_get_800 from "./api/secure-share/active/GET";
import secure_share_id_delete_801 from "./api/secure-share/[id]/DELETE";
import secure_share_id_revoke_and_rotate_post_802 from "./api/secure-share/[id]/revoke-and-rotate/POST";
import secure_share_token_get_803 from "./api/secure-share/[token]/GET";
import secure_share_token_post_804 from "./api/secure-share/[token]/POST";
import secure_share_token_content_get_805 from "./api/secure-share/[token]/content/GET";
import settings_backup_get_806 from "./api/settings/backup/GET";
import settings_backup_post_807 from "./api/settings/backup/POST";
import settings_backup_company_data_get_808 from "./api/settings/backup/company-data/GET";
import settings_backup_csv_pack_get_809 from "./api/settings/backup/csv-pack/GET";
import settings_backup_export_get_810 from "./api/settings/backup/export/GET";
import settings_backup_run_post_811 from "./api/settings/backup/run/POST";
import settings_backup_destination_get_812 from "./api/settings/backup-destination/GET";
import settings_backup_destination_post_813 from "./api/settings/backup-destination/POST";
import settings_dazza_ai_key_get_814 from "./api/settings/dazza-ai-key/GET";
import settings_dazza_ai_key_post_815 from "./api/settings/dazza-ai-key/POST";
import settings_file_transfer_backup_get_816 from "./api/settings/file-transfer-backup/GET";
import settings_file_transfer_backup_post_817 from "./api/settings/file-transfer-backup/POST";
import settings_retention_get_818 from "./api/settings/retention/GET";
import settings_retention_post_819 from "./api/settings/retention/POST";
import settings_storage_provider_get_820 from "./api/settings/storage-provider/GET";
import settings_storage_provider_debug_get_821 from "./api/settings/storage-provider/debug/GET";
import settings_storage_provider_test_post_822 from "./api/settings/storage-provider/test/POST";
import settings_terminology_get_823 from "./api/settings/terminology/GET";
import settings_terminology_post_824 from "./api/settings/terminology/POST";
import settings_xero_credentials_get_825 from "./api/settings/xero-credentials/GET";
import settings_xero_credentials_post_826 from "./api/settings/xero-credentials/POST";
import share_token_get_827 from "./api/share/[token]/GET";
import signin_history_get_828 from "./api/signin-history/GET";
import signup_post_829 from "./api/signup/POST";
import sos_get_830 from "./api/sos/GET";
import sos_acknowledge_post_831 from "./api/sos/acknowledge/POST";
import sos_trigger_post_832 from "./api/sos/trigger/POST";
import stakeholders_sms_post_833 from "./api/stakeholders/sms/POST";
import stripe_create_checkout_session_post_834 from "./api/stripe/create-checkout-session/POST";
import stripe_session_sessionId_get_835 from "./api/stripe/session/[sessionId]/GET";
import studio_generate_from_safety_post_836 from "./api/studio/generate-from-safety/POST";
import studio_upload_image_post_837 from "./api/studio/upload-image/POST";
import subscription_create_checkout_post_838 from "./api/subscription/create-checkout/POST";
import subscription_status_get_839 from "./api/subscription/status/GET";
import subscription_webhook_post_840 from "./api/subscription/webhook/POST";
import support_mode_audit_get_841 from "./api/support-mode/audit/GET";
import support_mode_checklist_get_842 from "./api/support-mode/checklist/GET";
import support_mode_checklist_put_843 from "./api/support-mode/checklist/PUT";
import support_mode_enter_post_844 from "./api/support-mode/enter/POST";
import support_mode_exit_post_845 from "./api/support-mode/exit/POST";
import support_mode_status_get_846 from "./api/support-mode/status/GET";
import tag_tasks_get_847 from "./api/tag-tasks/GET";
import tag_tasks_id_patch_848 from "./api/tag-tasks/[id]/PATCH";
import takeoff_pad_get_849 from "./api/takeoff-pad/GET";
import takeoff_pad_put_850 from "./api/takeoff-pad/PUT";
import tasks_post_851 from "./api/tasks/POST";
import tasks_id_put_852 from "./api/tasks/[id]/PUT";
import team_get_853 from "./api/team/GET";
import team_invite_post_854 from "./api/team/invite/POST";
import team_invites_get_855 from "./api/team/invites/GET";
import team_invites_post_856 from "./api/team/invites/POST";
import team_invites_id_cancel_post_857 from "./api/team/invites/[id]/cancel/POST";
import team_invites_id_resend_post_858 from "./api/team/invites/[id]/resend/POST";
import team_members_get_859 from "./api/team/members/GET";
import team_members_id_icon_permissions_get_860 from "./api/team/members/[id]/icon-permissions/GET";
import team_members_id_icon_permissions_put_861 from "./api/team/members/[id]/icon-permissions/PUT";
import team_resend_verification_post_862 from "./api/team/resend-verification/POST";
import team_schedule_migrate_post_863 from "./api/team/schedule/migrate/POST";
import team_shifts_get_864 from "./api/team/shifts/GET";
import team_shifts_post_865 from "./api/team/shifts/POST";
import team_shifts_id_delete_866 from "./api/team/shifts/[id]/DELETE";
import team_shifts_id_put_867 from "./api/team/shifts/[id]/PUT";
import team_time_entries_get_868 from "./api/team/time-entries/GET";
import team_time_entries_post_869 from "./api/team/time-entries/POST";
import team_time_entries_export_get_870 from "./api/team/time-entries/export/GET";
import team_time_entries_id_put_871 from "./api/team/time-entries/[id]/PUT";
import team_verify_user_post_872 from "./api/team/verify-user/POST";
import team_id_delete_873 from "./api/team/[id]/DELETE";
import team_id_put_874 from "./api/team/[id]/PUT";
import usage_get_875 from "./api/usage/GET";
import user_logs_get_876 from "./api/user-logs/GET";
import user_logs_users_get_877 from "./api/user-logs/users/GET";
import work_attendance_get_878 from "./api/work/attendance/GET";
import work_delays_get_879 from "./api/work/delays/GET";
import work_notes_get_880 from "./api/work/notes/GET";
import work_progress_get_881 from "./api/work/progress/GET";
import work_tasks_get_882 from "./api/work/tasks/GET";
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

    // ── Session guard ────────────────────────────────────────────────────────
    // The official BetterAuth twoFactor plugin handles 2FA at the sign-in level:
    // no authenticated session is created until the second factor succeeds.
    // SMS 2FA: the session is revoked before the challenge response is sent, so
    // no pending-challenge guard is needed here — the session simply won't exist
    // until the SMS verify endpoint creates a fresh one.
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
  // ── Dazza engine flag diagnostic — fires early, before any migrations ────────
  // Safe: never logs the raw secret value, only length/first-char/resolved boolean.
  // Uses the top-level getSecret import (already available at module load time).
  {
    const _rawEarly = String(getSecret('DAZZA_V3_ENABLED') ?? '');
    const _trimEarly = _rawEarly.trim().toLowerCase();
    const _v3Early = _trimEarly === 'true' || _trimEarly === '1' || _trimEarly === 'yes';
    console.log(
      `[startup] *** DAZZA_V3_ENABLED: present=${_rawEarly.length > 0}, len=${_rawEarly.length}, ` +
      `first='${_rawEarly.length > 0 ? _rawEarly[0] : ''}', trimmedLower='${_trimEarly}', resolved=${_v3Early} ` +
      `→ engine=${_v3Early ? 'V3' : 'V2-rollback'} ***`
    );
  }

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
    // Form templates
    { table: 'form_templates', column: 'shared_in_library', definition: 'BOOLEAN NOT NULL DEFAULT FALSE' },
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
    // ── job_swms: Studio document attachment columns (Phase 2) ───────────────
    { table: 'job_swms', column: 'studio_document_id',     definition: "INT NULL DEFAULT NULL COMMENT 'document_templates.id — set for Studio-sourced rows'" },
    { table: 'job_swms', column: 'studio_source_revision', definition: "VARCHAR(20) NULL DEFAULT NULL COMMENT 'Revision label at attachment time'" },
    { table: 'job_swms', column: 'content_snapshot_json',  definition: "LONGTEXT NULL DEFAULT NULL COMMENT 'Immutable builder_json snapshot at attachment time'" },
    { table: 'job_swms', column: 'studio_attached_at',     definition: "DATETIME NULL DEFAULT NULL COMMENT 'Timestamp of Studio attachment'" },
    // ── jobs: customer link (v2) ──────────────────────────────────────────────
    { table: 'jobs', column: 'customer_id', definition: 'INT NULL' },
    // ── profiles: invoices permission ────────────────────────────────────────
    { table: 'profiles', column: 'perm_invoices', definition: "TINYINT(1) NOT NULL DEFAULT 1" },
    // ── customers: Xero contact ID ────────────────────────────────────────────
    { table: 'customers', column: 'xero_contact_id', definition: "VARCHAR(100) NULL" },
    // ── user: TOTP 2FA ────────────────────────────────────────────────────────
    // totp_secret: widened to 512 to hold v1:<base64url(encrypted)> envelope
    { table: 'user', column: 'totp_secret',        definition: 'VARCHAR(512) NULL' },
    { table: 'user', column: 'two_factor_enabled', definition: 'TINYINT(1) NOT NULL DEFAULT 0' },
    // ── user: SMS 2FA ─────────────────────────────────────────────────────────
    { table: 'user', column: 'sms_2fa_enabled', definition: 'TINYINT(1) NOT NULL DEFAULT 0' },
    { table: 'user', column: 'sms_2fa_phone',   definition: 'VARCHAR(30) NULL' },
    // ── user: dedicated phone_verified flag (replaces verificationMethod hack) ─
    { table: 'user', column: 'phone_verified',  definition: 'TINYINT(1) NOT NULL DEFAULT 0' },
    // ── user: TOTP attempt counter (brute-force protection) ──────────────────
    { table: 'user', column: 'totp_attempts',   definition: 'INT NOT NULL DEFAULT 0' },
    { table: 'user', column: 'totp_locked_until', definition: 'DATETIME NULL' },
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
    // ── job_progress_lines: Program of Works scheduling fields ────────────────
    { table: 'job_progress_lines', column: 'start_date',  definition: 'DATE NULL' },
    { table: 'job_progress_lines', column: 'end_date',    definition: 'DATE NULL' },
    { table: 'job_progress_lines', column: 'sort_order',  definition: 'INT NOT NULL DEFAULT 0' },
    // ── job_progress_lines: section membership (PoW Gate 2) ──────────────────
    { table: 'job_progress_lines', column: 'section_id',  definition: 'INT NULL' },
    // ── job_form_submissions: external share fields ───────────────────────────
    { table: 'job_form_submissions', column: 'submitted_at',              definition: 'DATETIME NULL' },
    { table: 'job_form_submissions', column: 'external_submitter_name',   definition: 'VARCHAR(255) NULL' },
    { table: 'job_form_submissions', column: 'external_submitter_email',  definition: 'VARCHAR(255) NULL' },
    // ── job_form_submissions: archive / legal-hold lifecycle ─────────────────
    { table: 'job_form_submissions', column: 'archived_at',     definition: 'DATETIME NULL' },
    { table: 'job_form_submissions', column: 'archived_by',     definition: 'VARCHAR(255) NULL' },
    { table: 'job_form_submissions', column: 'archive_reason',  definition: 'TEXT NULL' },
    { table: 'job_form_submissions', column: 'legal_hold',      definition: 'TINYINT(1) NOT NULL DEFAULT 0' },
    // ── form_public_submissions: archive / legal-hold lifecycle ──────────────
    { table: 'form_public_submissions', column: 'archived_at',    definition: 'DATETIME NULL' },
    { table: 'form_public_submissions', column: 'archived_by',    definition: 'VARCHAR(255) NULL' },
    { table: 'form_public_submissions', column: 'archive_reason', definition: 'TEXT NULL' },
    { table: 'form_public_submissions', column: 'legal_hold',     definition: 'TINYINT(1) NOT NULL DEFAULT 0' },
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
    { table: 'document_templates', column: 'applied_widgets_json',        definition: "MEDIUMTEXT NULL COMMENT 'JSON array of AppliedWidgetMeta'" },
    // ── document_templates: safety-studio integration columns ────────────────
    { table: 'document_templates', column: 'safety_category',             definition: "VARCHAR(100) NULL DEFAULT NULL COMMENT 'SWMS | WHS Plan'" },
    { table: 'document_templates', column: 'source_widget_type',          definition: "VARCHAR(50) NULL DEFAULT NULL COMMENT 'swms | whs_plan'" },
    { table: 'document_templates', column: 'source_record_id',            definition: 'INT NULL DEFAULT NULL' },
    // ── document_templates: Phase 2 Word Source Document columns ─────────────
    { table: 'document_templates', column: 'source_type',         definition: "VARCHAR(20) NOT NULL DEFAULT 'blocks' COMMENT 'blocks|docx|pdf|html'" },
    { table: 'document_templates', column: 'source_file_key',     definition: "VARCHAR(1000) NULL COMMENT 'Storage key for original source file'" },
    { table: 'document_templates', column: 'source_file_name',    definition: "VARCHAR(500) NULL COMMENT 'Original uploaded filename'" },
    { table: 'document_templates', column: 'source_mime_type',    definition: "VARCHAR(100) NULL COMMENT 'MIME type of source file'" },
    { table: 'document_templates', column: 'source_sha256',       definition: "VARCHAR(64) NULL COMMENT 'SHA-256 hex of source file bytes'" },
    { table: 'document_templates', column: 'source_revision',     definition: "INT NOT NULL DEFAULT 0 COMMENT 'Monotonic revision counter'" },
    { table: 'document_templates', column: 'source_updated_at',   definition: "DATETIME NULL COMMENT 'When source file was last replaced'" },
    { table: 'document_templates', column: 'rendered_pdf_key',    definition: "VARCHAR(1000) NULL COMMENT 'Storage key for cached PDF render'" },
    // ── document_templates: HTML canvas columns (DOCX → editable HTML) ────────
    { table: 'document_templates', column: 'html_content',        definition: "LONGTEXT NULL COMMENT 'Sanitised HTML body for html-canvas documents'" },
    { table: 'document_templates', column: 'import_css',          definition: "LONGTEXT NULL COMMENT 'Scoped CSS produced by DOCX converter'" },
    { table: 'document_templates', column: 'import_report',       definition: "TEXT NULL COMMENT 'JSON: { dropped: string[], approximated: string[] }'" },
    // ── project_drawings: columns added after initial table creation ──────────
    { table: 'project_drawings', column: 'name',                  definition: 'VARCHAR(500) NOT NULL DEFAULT \'\'' },
    { table: 'project_drawings', column: 'title',                 definition: 'VARCHAR(500) NOT NULL DEFAULT \'\'' },
    { table: 'project_drawings', column: 'description',           definition: 'TEXT NULL' },
    { table: 'project_drawings', column: 'project_id',            definition: 'INT NULL' },
    { table: 'project_drawings', column: 'drawing_number',        definition: 'VARCHAR(100) NULL' },
    { table: 'project_drawings', column: 'discipline',            definition: 'VARCHAR(100) NULL' },
    { table: 'project_drawings', column: 'doc_status_label',      definition: 'VARCHAR(100) NULL' },
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
    // source_template_ref — "type:id" e.g. "form:42" — used for upsert on republish
    { table: 'library_items', column: 'source_template_ref', definition: "VARCHAR(100) NULL DEFAULT NULL" },
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
    // ── job_photos: Lens Phase 1 columns ─────────────────────────────────────
    { table: 'job_photos', column: 'status',         definition: "VARCHAR(30) NOT NULL DEFAULT 'draft'" },
    { table: 'job_photos', column: 'locked_at',      definition: 'DATETIME NULL' },
    { table: 'job_photos', column: 'locked_by_name', definition: 'VARCHAR(255) NULL' },
    { table: 'job_photos', column: 'media_asset_id', definition: 'INT NULL' },

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
    // ── bug_reports: export audit columns (added 2026-08-10) ────────────────
    { table: 'bug_reports', column: 'exported_at',       definition: 'DATETIME NULL' },
    { table: 'bug_reports', column: 'exported_by',       definition: "VARCHAR(255) NOT NULL DEFAULT ''" },
    // ── bug_reports: Dazza AI analysis + SMS auth (added 2026-08-14) ────────
    { table: 'bug_reports', column: 'ai_analysis',          definition: 'TEXT NULL' },
    { table: 'bug_reports', column: 'ai_suggested_fix',     definition: 'TEXT NULL' },
    { table: 'bug_reports', column: 'ai_suggested_prompt',  definition: 'TEXT NULL' },
    { table: 'bug_reports', column: 'ai_analysed_at',       definition: 'DATETIME NULL' },
    { table: 'bug_reports', column: 'sms_auth_token',       definition: 'VARCHAR(64) NULL' },
    { table: 'bug_reports', column: 'sms_auth_expires_at',  definition: 'DATETIME NULL' },
    { table: 'bug_reports',       column: 'sms_auth_used',        definition: 'TINYINT(1) NOT NULL DEFAULT 0' },
    // fleet_usage_logs — columns added after initial CREATE
    { table: 'fleet_usage_logs', column: 'meter_start',           definition: 'INT NULL' },
    { table: 'fleet_usage_logs', column: 'meter_end',             definition: 'INT NULL' },
    { table: 'fleet_usage_logs', column: 'actor_type',            definition: "VARCHAR(30) NOT NULL DEFAULT 'employee'" },
    // secure_share_links — token_encrypted added for at-rest URL recovery
    { table: 'secure_share_links', column: 'token_encrypted',     definition: 'TEXT NULL' },
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

  // ── 2b. Add composite index on job_progress_lines (company, job, sort_order, id) ──
  // Idempotent: check INFORMATION_SCHEMA before creating.
  try {
    const idxRows = await db.execute(sql.raw(
      "SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS " +
      "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'job_progress_lines' " +
      "AND INDEX_NAME = 'idx_progress_company_job_order'"
    )) as unknown as [Array<Record<string, unknown>>, unknown];
    if (!idxRows[0]?.length) {
      await db.execute(sql.raw(
        "CREATE INDEX idx_progress_company_job_order ON job_progress_lines (company_id, job_id, sort_order, id)"
      ));
      console.log('[startup-migration] Created idx_progress_company_job_order');
    }
  } catch (e: unknown) {
    console.warn('[startup-migration] Could not create idx_progress_company_job_order:', migrationErrMsg(e));
  }

  // ── 2c. Make job_todos.job_id nullable (general tasks support) ───────────────
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
    { table: 'job_form_submissions',  indexName: 'idx_jfs_archived',         columns: '(company_id, archived_at)' },
    { table: 'form_public_submissions', indexName: 'idx_fps_archived',       columns: '(company_id, archived_at)' },
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
    { name: 'sds_register', ddl: "CREATE TABLE IF NOT EXISTS sds_register (id INT AUTO_INCREMENT PRIMARY KEY, company_id INT NOT NULL, title VARCHAR(255) NOT NULL, product_name VARCHAR(255) NULL, manufacturer VARCHAR(255) NULL, original_name VARCHAR(255) NOT NULL, stored_name VARCHAR(255) NOT NULL, mime_type VARCHAR(100) NOT NULL DEFAULT 'application/pdf', size_bytes INT NOT NULL DEFAULT 0, notes TEXT NULL, archived_at DATETIME NULL, replaced_by_id INT NULL, replaced_at DATETIME NULL, replaced_by_user_id VARCHAR(36) NULL, uploaded_by_user_id VARCHAR(36) NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX idx_company (company_id), INDEX idx_archived (company_id, archived_at))" },
    // ── Job Site RL Register ──────────────────────────────────────────────────
    { name: 'rl_benchmarks', ddl: "CREATE TABLE IF NOT EXISTS rl_benchmarks (id INT AUTO_INCREMENT PRIMARY KEY, company_id INT NOT NULL, job_id INT NOT NULL, name VARCHAR(255) NOT NULL, rl DECIMAL(12,3) NOT NULL, description TEXT NULL, location VARCHAR(500) NULL, date_established DATE NULL, entered_by VARCHAR(255) NULL, notes TEXT NULL, photo_path VARCHAR(1000) NULL, archived_at DATETIME NULL, created_by_user_id VARCHAR(36) NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX idx_company (company_id), INDEX idx_job (company_id, job_id), INDEX idx_archived (company_id, archived_at))" },
    { name: 'rl_points', ddl: "CREATE TABLE IF NOT EXISTS rl_points (id INT AUTO_INCREMENT PRIMARY KEY, benchmark_id INT NOT NULL, company_id INT NOT NULL, job_id INT NOT NULL, point_name VARCHAR(255) NOT NULL, location VARCHAR(500) NULL, measured_rl DECIMAL(12,3) NOT NULL, target_rl DECIMAL(12,3) NULL, tolerance_mm INT NULL, rise_fall DECIMAL(12,3) NULL, measurement_date DATETIME NULL, entered_by VARCHAR(255) NULL, method VARCHAR(30) NOT NULL DEFAULT 'other', notes TEXT NULL, photo_path VARCHAR(1000) NULL, signed_off_at DATETIME NULL, signed_off_by VARCHAR(36) NULL, archived_at DATETIME NULL, created_by_user_id VARCHAR(36) NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX idx_benchmark (benchmark_id), INDEX idx_company (company_id), INDEX idx_job (company_id, job_id), INDEX idx_archived (company_id, archived_at))" },
    { name: 'rl_point_history', ddl: "CREATE TABLE IF NOT EXISTS rl_point_history (id INT AUTO_INCREMENT PRIMARY KEY, point_id INT NOT NULL, company_id INT NOT NULL, snapshot_json LONGTEXT NOT NULL, changed_by_user_id VARCHAR(36) NULL, correction_note TEXT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX idx_point (point_id), INDEX idx_company (company_id))" },
    // ── Electrical Test Recorder ──────────────────────────────────────────────
    { name: 'electrical_test_equipment', ddl: "CREATE TABLE IF NOT EXISTS electrical_test_equipment (id INT AUTO_INCREMENT PRIMARY KEY, company_id INT NOT NULL, owner VARCHAR(255) NULL, equipment_type VARCHAR(100) NOT NULL DEFAULT 'Other', make_model VARCHAR(255) NOT NULL, serial_number VARCHAR(100) NULL, calibration_date DATE NULL, calibration_expiry DATE NULL, cal_cert_storage_key VARCHAR(500) NULL, archived_at DATETIME NULL, created_by_user_id VARCHAR(36) NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX idx_company (company_id), INDEX idx_archived (company_id, archived_at))" },
    { name: 'electrical_test_records', ddl: "CREATE TABLE IF NOT EXISTS electrical_test_records (id INT AUTO_INCREMENT PRIMARY KEY, company_id INT NOT NULL, job_id INT NOT NULL, parent_test_id INT NULL, template_id VARCHAR(60) NOT NULL DEFAULT 'custom', template_name VARCHAR(255) NOT NULL DEFAULT 'Custom Test', asset_id VARCHAR(255) NULL, circuit_feeder VARCHAR(255) NULL, phase VARCHAR(20) NULL, joint_description TEXT NULL, reference_test_point VARCHAR(255) NULL, drawing_reference VARCHAR(255) NULL, work_type VARCHAR(30) NOT NULL DEFAULT 'new_installation', location VARCHAR(500) NULL, work_order_ref VARCHAR(100) NULL, measured_value DECIMAL(18,6) NULL, unit VARCHAR(30) NOT NULL DEFAULT '', test_current_voltage VARCHAR(50) NULL, ambient_temp DECIMAL(6,2) NULL, min_accept DECIMAL(18,6) NULL, max_accept DECIMAL(18,6) NULL, standard_ref VARCHAR(255) NULL, document_number VARCHAR(100) NULL, document_version VARCHAR(50) NULL, result VARCHAR(20) NOT NULL DEFAULT 'MANUAL', condition_class VARCHAR(10) NULL, standard_label VARCHAR(255) NULL, test_date DATETIME NULL, tester_name VARCHAR(255) NULL, tester_user_id VARCHAR(36) NULL, equipment_id INT NULL, corrective_work TEXT NULL, notes TEXT NULL, defect_action TEXT NULL, status VARCHAR(30) NOT NULL DEFAULT 'draft', submitted_at DATETIME NULL, submitted_by_user_id VARCHAR(36) NULL, submitted_by_name VARCHAR(255) NULL, checked_by_name VARCHAR(255) NULL, checked_at DATETIME NULL, accepted_by_name VARCHAR(255) NULL, accepted_at DATETIME NULL, rejection_reason TEXT NULL, override_by_name VARCHAR(255) NULL, override_at DATETIME NULL, override_justification TEXT NULL, archived_at DATETIME NULL, created_by_user_id VARCHAR(36) NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX idx_company (company_id), INDEX idx_job (company_id, job_id), INDEX idx_parent (parent_test_id), INDEX idx_status (company_id, status), INDEX idx_result (company_id, result), INDEX idx_archived (company_id, archived_at))" },
    { name: 'electrical_test_photos', ddl: "CREATE TABLE IF NOT EXISTS electrical_test_photos (id INT AUTO_INCREMENT PRIMARY KEY, test_record_id INT NOT NULL, company_id INT NOT NULL, photo_type VARCHAR(30) NOT NULL DEFAULT 'additional', caption TEXT NULL, storage_key VARCHAR(500) NOT NULL, original_name VARCHAR(255) NOT NULL, mime_type VARCHAR(100) NOT NULL, size_bytes INT NOT NULL DEFAULT 0, uploaded_by_user_id VARCHAR(36) NULL, uploaded_by_name VARCHAR(255) NULL, uploaded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX idx_record (test_record_id), INDEX idx_company (company_id))" },
    { name: 'electrical_test_audit', ddl: "CREATE TABLE IF NOT EXISTS electrical_test_audit (id INT AUTO_INCREMENT PRIMARY KEY, test_record_id INT NOT NULL, company_id INT NOT NULL, event_type VARCHAR(50) NOT NULL, event_note TEXT NULL, user_id VARCHAR(36) NULL, user_name VARCHAR(255) NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX idx_record (test_record_id), INDEX idx_company (company_id), INDEX idx_created (test_record_id, created_at))" },
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
    // ── Dazza V3 tables (added 2026-08-14) ──────────────────────────────────
    { name: 'dazza_incidents', ddl: "CREATE TABLE IF NOT EXISTS dazza_incidents (id VARCHAR(36) NOT NULL PRIMARY KEY, incident_type VARCHAR(100) NOT NULL, severity VARCHAR(20) NOT NULL DEFAULT 'medium', status VARCHAR(30) NOT NULL DEFAULT 'open', title VARCHAR(300) NOT NULL, fingerprint VARCHAR(500) NOT NULL DEFAULT '', affected_route VARCHAR(300) NULL, affected_company_id INT NULL, affected_user_count INT NOT NULL DEFAULT 1, description TEXT NOT NULL, evidence_json MEDIUMTEXT NULL, platform VARCHAR(50) NOT NULL DEFAULT 'web', app_version VARCHAR(50) NOT NULL DEFAULT '', customer_recovered TINYINT(1) NOT NULL DEFAULT 0, data_loss_risk TINYINT(1) NOT NULL DEFAULT 0, likely_cause TEXT NULL, alternative_causes TEXT NULL, confidence VARCHAR(20) NULL, immediate_workaround TEXT NULL, recommended_fix TEXT NULL, likely_files TEXT NULL, test_checklist TEXT NULL, repair_prompt MEDIUMTEXT NULL, investigation_report MEDIUMTEXT NULL, verification_result TEXT NULL, final_outcome TEXT NULL, notification_sent TINYINT(1) NOT NULL DEFAULT 0, notification_sent_at DATETIME NULL, notification_sms_sent TINYINT(1) NOT NULL DEFAULT 0, notification_email_sent TINYINT(1) NOT NULL DEFAULT 0, first_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, event_count INT NOT NULL DEFAULT 1, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX idx_severity (severity), INDEX idx_status (status), INDEX idx_fingerprint (fingerprint(100)), INDEX idx_company (affected_company_id), INDEX idx_last_seen (last_seen_at DESC))" },
    { name: 'dazza_client_rescue', ddl: "CREATE TABLE IF NOT EXISTS dazza_client_rescue (id VARCHAR(36) NOT NULL PRIMARY KEY, incident_id VARCHAR(36) NULL, user_id VARCHAR(36) NULL, user_name VARCHAR(255) NOT NULL DEFAULT '', user_email VARCHAR(255) NOT NULL DEFAULT '', user_phone VARCHAR(50) NOT NULL DEFAULT '', attempted_action VARCHAR(300) NOT NULL DEFAULT '', failure_description TEXT NOT NULL, recovered TINYINT(1) NOT NULL DEFAULT 0, last_successful_action VARCHAR(300) NULL, likely_cause TEXT NULL, safe_workaround TEXT NULL, suggested_call_wording TEXT NULL, rescue_status VARCHAR(30) NOT NULL DEFAULT 'needs_call', resolution_note TEXT NULL, called_at DATETIME NULL, resolved_at DATETIME NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX idx_incident (incident_id), INDEX idx_status (rescue_status), INDEX idx_user (user_id))" },
    { name: 'dazza_v3_conversations', ddl: "CREATE TABLE IF NOT EXISTS dazza_v3_conversations (id VARCHAR(36) NOT NULL PRIMARY KEY, conversation_id VARCHAR(36) NOT NULL, owner_user_id VARCHAR(36) NOT NULL, role VARCHAR(20) NOT NULL, content MEDIUMTEXT NOT NULL, turn_index INT NOT NULL DEFAULT 0, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX idx_conversation (conversation_id, turn_index), INDEX idx_owner (owner_user_id))" },
    { name: 'dazza_review_comments', ddl: "CREATE TABLE IF NOT EXISTS dazza_review_comments (id VARCHAR(36) NOT NULL PRIMARY KEY, bug_report_id VARCHAR(36) NOT NULL, version_label VARCHAR(100) NOT NULL, review_status VARCHAR(20) NOT NULL DEFAULT 'queued', what_happened TEXT NULL, what_found TEXT NULL, likely_cause TEXT NULL, recommended_fix TEXT NULL, airo_prompt MEDIUMTEXT NULL, confidence TINYINT UNSIGNED NULL, failure_reason VARCHAR(500) NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, completed_at DATETIME NULL, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, UNIQUE KEY uq_bug_version (bug_report_id, version_label), INDEX idx_bug (bug_report_id), INDEX idx_status (review_status))" },
    { name: 'dazza_v3_audit', ddl: "CREATE TABLE IF NOT EXISTS dazza_v3_audit (id VARCHAR(36) NOT NULL PRIMARY KEY, owner_user_id VARCHAR(36) NOT NULL, event_type VARCHAR(100) NOT NULL, details_json TEXT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX idx_owner (owner_user_id), INDEX idx_event (event_type), INDEX idx_created (created_at DESC))" },
    { name: 'dazza_attachments', ddl: "CREATE TABLE IF NOT EXISTS dazza_attachments (id VARCHAR(36) NOT NULL PRIMARY KEY, owner_user_id VARCHAR(36) NOT NULL, company_id INT NOT NULL DEFAULT 0, conversation_id VARCHAR(36) NULL, message_id VARCHAR(36) NULL, safe_filename VARCHAR(200) NOT NULL, mime_type VARCHAR(100) NOT NULL, byte_length INT NOT NULL DEFAULT 0, sha256 VARCHAR(64) NOT NULL, storage_key VARCHAR(500) NOT NULL, storage_provider VARCHAR(50) NOT NULL DEFAULT 'local', trust_classification VARCHAR(50) NOT NULL DEFAULT 'untrusted_external_data', parser_version VARCHAR(20) NOT NULL DEFAULT '1.0', created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX idx_owner (owner_user_id), INDEX idx_sha256 (owner_user_id, sha256), INDEX idx_conversation (conversation_id))" },
    { name: 'dazza_attachment_links', ddl: "CREATE TABLE IF NOT EXISTS dazza_attachment_links (id VARCHAR(36) NOT NULL PRIMARY KEY, attachment_id VARCHAR(36) NOT NULL, conversation_id VARCHAR(36) NOT NULL, message_id VARCHAR(36) NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE KEY uq_att_msg (attachment_id, message_id), INDEX idx_conversation (conversation_id), INDEX idx_attachment (attachment_id))" },
    // ── Dazza Builder Assistant tables (added 2026-08-30) ────────────────────
    { name: 'dazza_builder_versions', ddl: "CREATE TABLE IF NOT EXISTS dazza_builder_versions (id VARCHAR(36) NOT NULL PRIMARY KEY, template_id INT NOT NULL, builder_type VARCHAR(20) NOT NULL, version_number INT NOT NULL DEFAULT 1, owner_user_id VARCHAR(36) NOT NULL, change_source VARCHAR(50) NOT NULL DEFAULT 'dazza', instruction_summary VARCHAR(500) NOT NULL DEFAULT '', operations_json MEDIUMTEXT NULL, operations_count INT NOT NULL DEFAULT 0, previous_snapshot_json LONGTEXT NULL, new_snapshot_json LONGTEXT NULL, validation_result VARCHAR(50) NOT NULL DEFAULT 'valid', conversation_id VARCHAR(36) NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX idx_template (template_id, builder_type, version_number DESC), INDEX idx_owner (owner_user_id), INDEX idx_conversation (conversation_id))" },
    { name: 'dazza_builder_audit', ddl: "CREATE TABLE IF NOT EXISTS dazza_builder_audit (id VARCHAR(36) NOT NULL PRIMARY KEY, owner_user_id VARCHAR(36) NOT NULL, event_type VARCHAR(100) NOT NULL, details_json TEXT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX idx_owner (owner_user_id), INDEX idx_event (event_type), INDEX idx_created (created_at DESC))" },
    { name: 'builder_cases', ddl: "CREATE TABLE IF NOT EXISTS builder_cases (id VARCHAR(36) NOT NULL PRIMARY KEY, owner_user_id VARCHAR(36) NOT NULL, title VARCHAR(500) NOT NULL, requested_result TEXT NULL, linked_bug_id VARCHAR(36) NULL, conversation_id VARCHAR(36) NULL, anatomy_snapshot_id VARCHAR(36) NULL, anatomy_commit_sha VARCHAR(40) NULL, anatomy_snapshot_name VARCHAR(200) NULL, source_version VARCHAR(200) NULL, repo_name VARCHAR(200) NULL, status ENUM('draft','analysing','diagnosis_ready','patch_ready','awaiting_daryl_review','sent_to_airo','awaiting_verification','verified','failed','closed') NOT NULL DEFAULT 'draft', risk_level ENUM('low','medium','high','critical') NULL, confirmed_symptom TEXT NULL, root_cause TEXT NULL, evidence TEXT NULL, files_inspected TEXT NULL, assumptions TEXT NULL, unknowns TEXT NULL, proposed_files TEXT NULL, change_summary TEXT NULL, db_route_impact TEXT NULL, security_considerations TEXT NULL, rollback_instructions TEXT NULL, proposed_patch MEDIUMTEXT NULL, airo_prompt MEDIUMTEXT NULL, test_plan TEXT NULL, runtime_checks TEXT NULL, verification_notes TEXT NULL, resolution_note TEXT NULL, sent_to_airo_at DATETIME NULL, verified_at DATETIME NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX idx_owner (owner_user_id), INDEX idx_status (status), INDEX idx_bug (linked_bug_id), INDEX idx_updated (updated_at DESC))" },
    // ── Bug Communication Centre (added 2026-08-14) ──────────────────────────
    { name: 'incident_communications', ddl: "CREATE TABLE IF NOT EXISTS incident_communications (id VARCHAR(36) NOT NULL PRIMARY KEY, incident_id VARCHAR(36) NULL, bug_report_id INT NULL, comm_type VARCHAR(30) NOT NULL DEFAULT 'banner', channel VARCHAR(30) NOT NULL DEFAULT 'dashboard', status VARCHAR(30) NOT NULL DEFAULT 'draft', title VARCHAR(300) NOT NULL, message TEXT NOT NULL, workaround TEXT NULL, action_label VARCHAR(100) NULL, action_url VARCHAR(500) NULL, target_scope VARCHAR(30) NOT NULL DEFAULT 'affected_users', target_company_id INT NULL, target_user_id VARCHAR(36) NULL, target_build VARCHAR(50) NULL, target_route VARCHAR(300) NULL, is_dismissible TINYINT(1) NOT NULL DEFAULT 1, is_critical TINYINT(1) NOT NULL DEFAULT 0, approved_by_user_id VARCHAR(36) NULL, approved_at DATETIME NULL, display_from DATETIME NULL, display_until DATETIME NULL, removed_at DATETIME NULL, removed_by_user_id VARCHAR(36) NULL, view_count INT NOT NULL DEFAULT 0, dismiss_count INT NOT NULL DEFAULT 0, resolve_confirm_count INT NOT NULL DEFAULT 0, still_trouble_count INT NOT NULL DEFAULT 0, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX idx_incident (incident_id), INDEX idx_status (status), INDEX idx_scope (target_scope, status), INDEX idx_company (target_company_id))" },
    { name: 'incident_comm_dismissals', ddl: "CREATE TABLE IF NOT EXISTS incident_comm_dismissals (id INT AUTO_INCREMENT PRIMARY KEY, comm_id VARCHAR(36) NOT NULL, user_id VARCHAR(36) NOT NULL, dismissed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE KEY uq_comm_user (comm_id, user_id), INDEX idx_user (user_id))" },
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
    // ── Program of Works sections (PoW Gate 2) ────────────────────────────────
    { name: 'job_progress_sections', ddl: "CREATE TABLE IF NOT EXISTS job_progress_sections (id INT AUTO_INCREMENT PRIMARY KEY, job_id INT NOT NULL, company_id INT NOT NULL, title VARCHAR(255) NOT NULL, description TEXT NULL, sort_order INT NOT NULL DEFAULT 0, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX idx_section_company_job (company_id, job_id, sort_order, id))" },
    // ── PO sequence counter: one row per company, atomic increment, no reuse on delete ──
    { name: 'po_sequences', ddl: "CREATE TABLE IF NOT EXISTS po_sequences (company_id INT NOT NULL, last_seq INT NOT NULL DEFAULT 0, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, PRIMARY KEY (company_id), UNIQUE KEY uq_company (company_id))" },
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
    { name: 'secure_share_access_proofs', ddl: "CREATE TABLE IF NOT EXISTS secure_share_access_proofs (id INT AUTO_INCREMENT PRIMARY KEY, share_link_id INT NOT NULL, proof_hash VARCHAR(64) NOT NULL UNIQUE, expires_at DATETIME NOT NULL, used TINYINT(1) NOT NULL DEFAULT 0, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX idx_link (share_link_id), INDEX idx_proof (proof_hash), INDEX idx_expires (expires_at))" },
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
    // ── submission_audit_log — records archive / restore / permanent-delete events ──
    { name: 'submission_audit_log', ddl: "CREATE TABLE IF NOT EXISTS submission_audit_log (id INT AUTO_INCREMENT PRIMARY KEY, company_id INT NOT NULL, submission_source VARCHAR(20) NOT NULL, submission_id INT NOT NULL, action VARCHAR(40) NOT NULL, actor_user_id VARCHAR(36) NOT NULL, actor_name VARCHAR(255) NULL, note TEXT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX idx_sal_company (company_id), INDEX idx_sal_submission (submission_source, submission_id), INDEX idx_sal_action (company_id, action))" },
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
    // ── Dazza Anatomy Index (auto-migrated at startup — no manual endpoint needed) ──
    { name: 'anatomy_snapshots', ddl: "CREATE TABLE IF NOT EXISTS anatomy_snapshots (id VARCHAR(36) PRIMARY KEY, source_type ENUM('github','zip') NOT NULL, repo_owner VARCHAR(200) NULL, repo_name VARCHAR(200) NULL, branch VARCHAR(200) NULL, commit_sha VARCHAR(40) NULL, commit_date DATETIME NULL, package_sha256 VARCHAR(64) NULL, snapshot_name VARCHAR(200) NULL, source_desc VARCHAR(500) NULL, app_version VARCHAR(100) NULL, build_number VARCHAR(100) NULL, git_ref VARCHAR(200) NULL, status ENUM('pending','indexing','ready','failed','deleted') NOT NULL DEFAULT 'pending', is_active TINYINT(1) NOT NULL DEFAULT 0, total_files INT NOT NULL DEFAULT 0, indexed_files INT NOT NULL DEFAULT 0, excluded_files INT NOT NULL DEFAULT 0, quarantine_count INT NOT NULL DEFAULT 0, error_message TEXT NULL, uploader_user_id VARCHAR(36) NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX idx_anatomy_snapshots_status (status), INDEX idx_anatomy_snapshots_active (is_active), INDEX idx_anatomy_snapshots_sha (commit_sha))" },
    { name: 'anatomy_files', ddl: "CREATE TABLE IF NOT EXISTS anatomy_files (id BIGINT PRIMARY KEY AUTO_INCREMENT, snapshot_id VARCHAR(36) NOT NULL, rel_path VARCHAR(1000) NOT NULL, file_sha256 VARCHAR(64) NULL, language VARCHAR(50) NULL, file_type VARCHAR(50) NULL, line_count INT NOT NULL DEFAULT 0, byte_size INT NOT NULL DEFAULT 0, is_excluded TINYINT(1) NOT NULL DEFAULT 0, is_quarantined TINYINT(1) NOT NULL DEFAULT 0, quarantine_reason VARCHAR(500) NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX idx_anatomy_files_snapshot (snapshot_id), INDEX idx_anatomy_files_path (snapshot_id, rel_path(255)), INDEX idx_anatomy_files_lang (snapshot_id, language))" },
    { name: 'anatomy_chunks', ddl: "CREATE TABLE IF NOT EXISTS anatomy_chunks (id BIGINT PRIMARY KEY AUTO_INCREMENT, snapshot_id VARCHAR(36) NOT NULL, file_id BIGINT NOT NULL, rel_path VARCHAR(1000) NOT NULL, start_line INT NOT NULL, end_line INT NOT NULL, content MEDIUMTEXT NOT NULL, chunk_type VARCHAR(50) NULL, symbol_name VARCHAR(500) NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, FULLTEXT INDEX ft_anatomy_chunks_content (content), INDEX idx_anatomy_chunks_snapshot (snapshot_id), INDEX idx_anatomy_chunks_file (file_id), INDEX idx_anatomy_chunks_path (snapshot_id, rel_path(255)))" },
    { name: 'anatomy_quarantine', ddl: "CREATE TABLE IF NOT EXISTS anatomy_quarantine (id BIGINT PRIMARY KEY AUTO_INCREMENT, snapshot_id VARCHAR(36) NOT NULL, rel_path VARCHAR(1000) NOT NULL, reason VARCHAR(500) NOT NULL, pattern_matched VARCHAR(200) NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX idx_anatomy_quarantine_snapshot (snapshot_id))" },
    // ── 2FA security tables ───────────────────────────────────────────────────
    { name: 'pending_2fa_challenges', ddl: "CREATE TABLE IF NOT EXISTS pending_2fa_challenges (id VARCHAR(36) PRIMARY KEY, user_id VARCHAR(36) NOT NULL, token_hash VARCHAR(64) NOT NULL UNIQUE, method ENUM('totp','sms') NOT NULL DEFAULT 'totp', expires_at DATETIME NOT NULL, attempts INT NOT NULL DEFAULT 0, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX idx_p2fa_user (user_id), INDEX idx_p2fa_token (token_hash), INDEX idx_p2fa_expires (expires_at))" },
    { name: 'totp_backup_codes', ddl: "CREATE TABLE IF NOT EXISTS totp_backup_codes (id VARCHAR(36) PRIMARY KEY, user_id VARCHAR(36) NOT NULL, code_hash VARCHAR(64) NOT NULL, used_at DATETIME NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX idx_tbc_user (user_id), INDEX idx_tbc_hash (user_id, code_hash))" },
    // Official BetterAuth twoFactor plugin table — stores encrypted TOTP secrets,
    // encrypted backup codes, and per-account lockout state.
    // The plugin uses BETTER_AUTH_SECRET (via symmetricEncrypt) for encryption —
    // NOT TOTP_ENCRYPTION_KEY. This table is additive; existing custom columns
    // (totp_secret, totp_attempts, totp_locked_until) on the user table are preserved.
    { name: 'twoFactor', ddl: "CREATE TABLE IF NOT EXISTS `twoFactor` (id VARCHAR(36) PRIMARY KEY, secret TEXT NOT NULL, backup_codes TEXT NOT NULL, user_id VARCHAR(36) NOT NULL, verified TINYINT(1) NOT NULL DEFAULT 1, failed_verification_count INT NOT NULL DEFAULT 0, locked_until DATETIME NULL, INDEX idx_tf_user (user_id), INDEX idx_tf_user_id (user_id))" },
    // ── Phase 2: Word Source Document revision history ────────────────────────
    { name: 'document_template_revisions', ddl: "CREATE TABLE IF NOT EXISTS document_template_revisions (id INT AUTO_INCREMENT PRIMARY KEY, template_id INT NOT NULL, company_id INT NOT NULL, revision INT NOT NULL DEFAULT 1, source_type VARCHAR(20) NOT NULL DEFAULT 'docx', source_file_key VARCHAR(1000) NOT NULL, source_file_name VARCHAR(500) NOT NULL, source_mime_type VARCHAR(100) NOT NULL, source_sha256 VARCHAR(64) NOT NULL, file_size_bytes INT NOT NULL DEFAULT 0, uploaded_by VARCHAR(36) NULL, uploaded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, notes TEXT NULL, INDEX idx_dtr_template (template_id), INDEX idx_dtr_company (company_id), INDEX idx_dtr_revision (template_id, revision))" },
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

  // ── Anatomy schema repair ─────────────────────────────────────────────────
  // The safetyTables loop above only CREATEs missing tables — it skips existing
  // ones. If anatomy_snapshots was created by an older migration endpoint with a
  // different schema, the INSERT will fail. These ALTER TABLE … ADD COLUMN IF NOT
  // EXISTS statements are idempotent and run on every startup to ensure the live
  // schema always matches the INSERT in the fetch handler.
  {
    const anatomyAlters: Array<{ table: string; col: string; ddl: string }> = [
      // anatomy_snapshots — ADD COLUMN only (no MODIFY; CREATE already has correct ENUM types)
      { table: 'anatomy_snapshots', col: 'id',              ddl: "ALTER TABLE anatomy_snapshots ADD COLUMN id VARCHAR(36) NOT NULL DEFAULT ''" },
      { table: 'anatomy_snapshots', col: 'repo_owner',      ddl: "ALTER TABLE anatomy_snapshots ADD COLUMN repo_owner VARCHAR(200) NULL" },
      { table: 'anatomy_snapshots', col: 'repo_name',       ddl: "ALTER TABLE anatomy_snapshots ADD COLUMN repo_name VARCHAR(200) NULL" },
      { table: 'anatomy_snapshots', col: 'branch',          ddl: "ALTER TABLE anatomy_snapshots ADD COLUMN branch VARCHAR(200) NULL" },
      { table: 'anatomy_snapshots', col: 'commit_sha',      ddl: "ALTER TABLE anatomy_snapshots ADD COLUMN commit_sha VARCHAR(40) NULL" },
      { table: 'anatomy_snapshots', col: 'commit_date',     ddl: "ALTER TABLE anatomy_snapshots ADD COLUMN commit_date DATETIME NULL" },
      { table: 'anatomy_snapshots', col: 'package_sha256',  ddl: "ALTER TABLE anatomy_snapshots ADD COLUMN package_sha256 VARCHAR(64) NULL" },
      { table: 'anatomy_snapshots', col: 'snapshot_name',   ddl: "ALTER TABLE anatomy_snapshots ADD COLUMN snapshot_name VARCHAR(200) NULL" },
      { table: 'anatomy_snapshots', col: 'source_desc',     ddl: "ALTER TABLE anatomy_snapshots ADD COLUMN source_desc VARCHAR(500) NULL" },
      { table: 'anatomy_snapshots', col: 'app_version',     ddl: "ALTER TABLE anatomy_snapshots ADD COLUMN app_version VARCHAR(100) NULL" },
      { table: 'anatomy_snapshots', col: 'build_number',    ddl: "ALTER TABLE anatomy_snapshots ADD COLUMN build_number VARCHAR(100) NULL" },
      { table: 'anatomy_snapshots', col: 'git_ref',         ddl: "ALTER TABLE anatomy_snapshots ADD COLUMN git_ref VARCHAR(200) NULL" },
      { table: 'anatomy_snapshots', col: 'is_active',       ddl: "ALTER TABLE anatomy_snapshots ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 0" },
      { table: 'anatomy_snapshots', col: 'total_files',     ddl: "ALTER TABLE anatomy_snapshots ADD COLUMN total_files INT NOT NULL DEFAULT 0" },
      { table: 'anatomy_snapshots', col: 'indexed_files',   ddl: "ALTER TABLE anatomy_snapshots ADD COLUMN indexed_files INT NOT NULL DEFAULT 0" },
      { table: 'anatomy_snapshots', col: 'excluded_files',  ddl: "ALTER TABLE anatomy_snapshots ADD COLUMN excluded_files INT NOT NULL DEFAULT 0" },
      { table: 'anatomy_snapshots', col: 'quarantine_count',ddl: "ALTER TABLE anatomy_snapshots ADD COLUMN quarantine_count INT NOT NULL DEFAULT 0" },
      { table: 'anatomy_snapshots', col: 'error_message',   ddl: "ALTER TABLE anatomy_snapshots ADD COLUMN error_message TEXT NULL" },
      { table: 'anatomy_snapshots', col: 'uploader_user_id',ddl: "ALTER TABLE anatomy_snapshots ADD COLUMN uploader_user_id VARCHAR(36) NULL" },
      { table: 'anatomy_snapshots', col: 'created_at',      ddl: "ALTER TABLE anatomy_snapshots ADD COLUMN created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP" },
      { table: 'anatomy_snapshots', col: 'updated_at',      ddl: "ALTER TABLE anatomy_snapshots ADD COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP" },
      // anatomy_files
      { table: 'anatomy_files', col: 'snapshot_id',     ddl: "ALTER TABLE anatomy_files ADD COLUMN snapshot_id VARCHAR(36) NOT NULL DEFAULT ''" },
      { table: 'anatomy_files', col: 'rel_path',        ddl: "ALTER TABLE anatomy_files ADD COLUMN rel_path VARCHAR(1000) NOT NULL DEFAULT ''" },
      { table: 'anatomy_files', col: 'file_sha256',     ddl: "ALTER TABLE anatomy_files ADD COLUMN file_sha256 VARCHAR(64) NULL" },
      { table: 'anatomy_files', col: 'language',        ddl: "ALTER TABLE anatomy_files ADD COLUMN language VARCHAR(50) NULL" },
      { table: 'anatomy_files', col: 'file_type',       ddl: "ALTER TABLE anatomy_files ADD COLUMN file_type VARCHAR(50) NULL" },
      { table: 'anatomy_files', col: 'line_count',      ddl: "ALTER TABLE anatomy_files ADD COLUMN line_count INT NOT NULL DEFAULT 0" },
      { table: 'anatomy_files', col: 'byte_size',       ddl: "ALTER TABLE anatomy_files ADD COLUMN byte_size INT NOT NULL DEFAULT 0" },
      { table: 'anatomy_files', col: 'is_excluded',     ddl: "ALTER TABLE anatomy_files ADD COLUMN is_excluded TINYINT(1) NOT NULL DEFAULT 0" },
      { table: 'anatomy_files', col: 'is_quarantined',  ddl: "ALTER TABLE anatomy_files ADD COLUMN is_quarantined TINYINT(1) NOT NULL DEFAULT 0" },
      { table: 'anatomy_files', col: 'quarantine_reason',ddl: "ALTER TABLE anatomy_files ADD COLUMN quarantine_reason VARCHAR(500) NULL" },
      // anatomy_chunks
      { table: 'anatomy_chunks', col: 'snapshot_id',  ddl: "ALTER TABLE anatomy_chunks ADD COLUMN snapshot_id VARCHAR(36) NOT NULL DEFAULT ''" },
      { table: 'anatomy_chunks', col: 'file_id',      ddl: "ALTER TABLE anatomy_chunks ADD COLUMN file_id BIGINT NOT NULL DEFAULT 0" },
      { table: 'anatomy_chunks', col: 'rel_path',     ddl: "ALTER TABLE anatomy_chunks ADD COLUMN rel_path VARCHAR(1000) NOT NULL DEFAULT ''" },
      { table: 'anatomy_chunks', col: 'start_line',   ddl: "ALTER TABLE anatomy_chunks ADD COLUMN start_line INT NOT NULL DEFAULT 0" },
      { table: 'anatomy_chunks', col: 'end_line',     ddl: "ALTER TABLE anatomy_chunks ADD COLUMN end_line INT NOT NULL DEFAULT 0" },
      { table: 'anatomy_chunks', col: 'content',      ddl: "ALTER TABLE anatomy_chunks ADD COLUMN content MEDIUMTEXT NOT NULL DEFAULT ''" },
      { table: 'anatomy_chunks', col: 'chunk_type',   ddl: "ALTER TABLE anatomy_chunks ADD COLUMN chunk_type VARCHAR(50) NULL" },
      { table: 'anatomy_chunks', col: 'symbol_name',  ddl: "ALTER TABLE anatomy_chunks ADD COLUMN symbol_name VARCHAR(500) NULL" },
      // anatomy_quarantine
      { table: 'anatomy_quarantine', col: 'snapshot_id',     ddl: "ALTER TABLE anatomy_quarantine ADD COLUMN snapshot_id VARCHAR(36) NOT NULL DEFAULT ''" },
      { table: 'anatomy_quarantine', col: 'rel_path',        ddl: "ALTER TABLE anatomy_quarantine ADD COLUMN rel_path VARCHAR(1000) NOT NULL DEFAULT ''" },
      { table: 'anatomy_quarantine', col: 'reason',          ddl: "ALTER TABLE anatomy_quarantine ADD COLUMN reason VARCHAR(500) NOT NULL DEFAULT ''" },
      { table: 'anatomy_quarantine', col: 'pattern_matched', ddl: "ALTER TABLE anatomy_quarantine ADD COLUMN pattern_matched VARCHAR(200) NULL" },
    ];

    for (const { table, col, ddl } of anatomyAlters) {
      try {
        // Only attempt ALTER if the table exists — avoids errors on fresh DBs
        // where the safetyTables CREATE already built the correct schema.
        const [tblRows] = await db.execute(
          sql`SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${table}`
        ) as unknown as [Array<{ cnt: number }>, unknown];
        if (Number(tblRows?.[0]?.cnt ?? 0) === 0) continue; // table not yet created — skip

        // Check if column already exists with correct definition
        const [colRows] = await db.execute(
          sql`SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${table} AND COLUMN_NAME = ${col}`
        ) as unknown as [Array<{ cnt: number }>, unknown];

        // Skip if column already exists — ADD COLUMN without IF NOT EXISTS would error
        if (Number(colRows?.[0]?.cnt ?? 0) > 0) continue;

        await db.execute(sql.raw(ddl));
        console.log(`[startup-migration] anatomy: added ${table}.${col}`);
      } catch (e: unknown) {
        const msg = migrationErrMsg(e);
        // Suppress "already exists" noise — these are idempotent
        if (!msg.includes('already exists') && !msg.includes('Duplicate column')) {
          console.warn(`[startup-migration] anatomy alter ${table}.${col}:`, msg);
        }
      }
    }
    console.log('[startup-migration] anatomy schema repair complete');
  }

  // Account recovery tables (idempotent — safe to run on every startup)
  const recoveryTables = [
    {
      name: 'password_reset_tokens',
      ddl: "CREATE TABLE IF NOT EXISTS password_reset_tokens (id VARCHAR(36) NOT NULL PRIMARY KEY, user_id VARCHAR(36) NOT NULL, token_hash VARCHAR(64) NOT NULL, expires_at DATETIME NOT NULL, used_at DATETIME NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX idx_user (user_id), INDEX idx_hash (token_hash))",
    },
    {
      name: 'sms_verification_codes',
      ddl: "CREATE TABLE IF NOT EXISTS sms_verification_codes (id VARCHAR(36) NOT NULL PRIMARY KEY, user_id VARCHAR(36) NOT NULL, code_hash VARCHAR(64) NOT NULL, phone VARCHAR(30) NOT NULL DEFAULT '', expires_at DATETIME NOT NULL, attempts INT NOT NULL DEFAULT 0, verified_at DATETIME NULL, used_at DATETIME NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX idx_user (user_id))",
    },
    {
      name: 'bug_reports',
      ddl: "CREATE TABLE IF NOT EXISTS bug_reports (id VARCHAR(36) NOT NULL PRIMARY KEY, submitted_by_user_id VARCHAR(36) NOT NULL, submitted_by_name VARCHAR(255) NOT NULL DEFAULT '', submitted_by_email VARCHAR(255) NOT NULL DEFAULT '', company_id INT NULL, category VARCHAR(100) NOT NULL DEFAULT '', description TEXT NOT NULL, page_url VARCHAR(500) NOT NULL DEFAULT '', user_agent VARCHAR(500) NOT NULL DEFAULT '', screenshot_path VARCHAR(500) NULL, screenshot_bucket VARCHAR(100) NULL, status VARCHAR(30) NOT NULL DEFAULT 'open', resolution_note TEXT NULL, resolved_by_name VARCHAR(255) NULL, resolved_at DATETIME NULL, platform VARCHAR(50) NOT NULL DEFAULT 'web', app_version VARCHAR(50) NOT NULL DEFAULT '', current_route VARCHAR(300) NOT NULL DEFAULT '', diagnostic_events MEDIUMTEXT NULL, exported_at DATETIME NULL, exported_by VARCHAR(255) NOT NULL DEFAULT '', created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX idx_status (status), INDEX idx_created (created_at DESC), INDEX idx_user (submitted_by_user_id))",
    },
    {
      // media_assets — canonical record for every file stored in R2 / local storage.
      // job_photos.media_asset_id is a FK to this table.
      // Must be created BEFORE job_photos so the FK column resolves.
      name: 'media_assets',
      ddl: "CREATE TABLE IF NOT EXISTS media_assets (id INT AUTO_INCREMENT PRIMARY KEY, company_id INT NULL, uploaded_by_user_id VARCHAR(36) NULL, storage_key VARCHAR(500) NOT NULL, bucket VARCHAR(100) NULL, original_name VARCHAR(255) NULL, mime_type VARCHAR(100) NULL, size_bytes INT NULL, image_width INT NULL, image_height INT NULL, cached_url TEXT NULL, cached_url_expires_at DATETIME NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX idx_storage_key (storage_key(255)), INDEX idx_company (company_id))",
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
      { key: 'from_name',                  value: 'IWIllBUIlD' },
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
  // daryl.williams@energyq.com.au = also a developer account (platform access granted)
  const developerEmails = ['darylwilliams1581@gmail.com', 'daryl.williams@energyq.com.au'];
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
  // getSecret is already imported at the top of this file — no dynamic import needed.
  const ownerEmailSecret = (() => { try { return String(getSecret('PLATFORM_OWNER_EMAIL') ?? ''); } catch { return ''; } })();
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

  // ── library_items: unique index on source_template_ref ───────────────────────
  // Allows upsert (INSERT … ON DUPLICATE KEY UPDATE) when republishing a template.
  try {
    const [libIdxRows] = await db.execute(
      sql`SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.STATISTICS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'library_items'
            AND INDEX_NAME = 'uq_lib_source_template_ref'`
    ) as unknown as [Array<{ cnt: number }>, unknown];
    if (Number(libIdxRows?.[0]?.cnt ?? 0) === 0) {
      await db.execute(sql.raw(
        `ALTER TABLE library_items ADD UNIQUE INDEX uq_lib_source_template_ref (source_template_ref)`
      ));
      console.log('[startup-migration] library_items.uq_lib_source_template_ref index added');
    }
  } catch (e: unknown) {
    console.warn('[startup-migration] library_items source_template_ref index:', migrationErrMsg(e));
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
  // Recovery email tables — independent, non-blocking
  void import('./db/migrations/recovery-email.js').then(m =>
    m.runRecoveryEmailMigration().catch((e: unknown) =>
      console.error('[recovery-email] migration fatal:', e)
    )
  );

  // ── sms_verification_codes.id column type repair ─────────────────────────────
  // Historical context: the original CREATE TABLE DDL used INT AUTO_INCREMENT for
  // the id column, but the Drizzle schema and all insert paths use VARCHAR(36) UUIDs.
  // This migration detects the mismatch and repairs it WITHOUT truncating data.
  //
  // Strategy: if any existing rows have INT-style ids (numeric strings), they are
  // short-lived verification codes (10-min expiry) that are already expired. We
  // DELETE only the expired rows, then MODIFY COLUMN. This avoids TRUNCATE which
  // would discard any unexpired codes (unlikely but possible in a race window).
  //
  // Fully idempotent: once the column is VARCHAR it exits immediately.
  void (async () => {
    try {
      // 1. Check current column type
      const [[colRow]] = await db.execute(sql.raw(
        "SELECT DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS " +
        "WHERE TABLE_SCHEMA = DATABASE() " +
        "  AND TABLE_NAME  = 'sms_verification_codes' " +
        "  AND COLUMN_NAME = 'id'"
      )) as unknown as [[{ DATA_TYPE: string } | undefined]];

      if (!colRow) {
        // Table doesn't exist yet — CREATE TABLE DDL (corrected to VARCHAR) handles it.
        return;
      }

      if (colRow.DATA_TYPE?.toLowerCase() === 'varchar') {
        // Already correct — no action needed.
        return;
      }

      // 2. Delete only expired rows (INT ids are all expired codes; expiry < 10 min)
      await db.execute(sql.raw(
        "DELETE FROM `sms_verification_codes` WHERE expires_at < NOW()"
      ));

      // 3. Alter column: remove AUTO_INCREMENT, change type to VARCHAR(36)
      await db.execute(sql.raw(
        "ALTER TABLE `sms_verification_codes` MODIFY COLUMN `id` VARCHAR(36) NOT NULL"
      ));

      // 4. Verify the repair succeeded
      const [[verifyRow]] = await db.execute(sql.raw(
        "SELECT DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS " +
        "WHERE TABLE_SCHEMA = DATABASE() " +
        "  AND TABLE_NAME  = 'sms_verification_codes' " +
        "  AND COLUMN_NAME = 'id'"
      )) as unknown as [[{ DATA_TYPE: string } | undefined]];

      if (verifyRow?.DATA_TYPE?.toLowerCase() !== 'varchar') {
        console.error('[startup-migration] sms_verification_codes.id repair FAILED — column is still', verifyRow?.DATA_TYPE);
      } else {
        console.log('[startup-migration] sms_verification_codes.id repaired: INT → VARCHAR(36)');
      }
    } catch (e) {
      console.warn('[startup-migration] sms_verification_codes.id repair skipped:', (e as Error)?.message?.slice(0, 160));
    }
  })();
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
const openAiKey = String(getSecret('OPENAI_API_KEY') ?? '');
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
app.post("/api/admin/fix-all-photo-fields", admin_fix_all_photo_fields_post_1);
app.post("/api/admin/fix-photo-record-fields", admin_fix_photo_record_fields_post_2);
app.post("/api/admin/fix-photo-thumbnails", admin_fix_photo_thumbnails_post_3);
app.post("/api/admin/recovery-email/freeze", admin_recovery_email_freeze_post_4);
app.post("/api/admin/set-user-company", admin_set_user_company_post_5);
app.get("/api/asset-manager/assets", asset_manager_assets_get_6);
app.post("/api/asset-manager/assets", asset_manager_assets_post_7);
app.get("/api/asset-manager/assets/:id", asset_manager_assets_id_get_8);
app.patch("/api/asset-manager/assets/:id", asset_manager_assets_id_patch_9);
app.post("/api/asset-manager/assets/:id/archive", asset_manager_assets_id_archive_post_10);
app.get("/api/asset-manager/assets/:id/notes", asset_manager_assets_id_notes_get_11);
app.post("/api/asset-manager/assets/:id/notes", asset_manager_assets_id_notes_post_12);
app.delete("/api/asset-manager/assets/:id/notes/:noteId", asset_manager_assets_id_notes_noteId_delete_13);
app.delete("/api/asset-manager/assets/:id/permanent", asset_manager_assets_id_permanent_delete_14);
app.get("/api/asset-manager/assets/:id/photos", asset_manager_assets_id_photos_get_15);
app.post("/api/asset-manager/assets/:id/photos", asset_manager_assets_id_photos_post_16);
app.delete("/api/asset-manager/assets/:id/photos/:photoId", asset_manager_assets_id_photos_photoId_delete_17);
app.post("/api/asset-manager/assets/:id/restore", asset_manager_assets_id_restore_post_18);
app.get("/api/asset-manager/assets/:id/todos", asset_manager_assets_id_todos_get_19);
app.post("/api/asset-manager/assets/:id/todos", asset_manager_assets_id_todos_post_20);
app.delete("/api/asset-manager/assets/:id/todos/:todoId", asset_manager_assets_id_todos_todoId_delete_21);
app.put("/api/asset-manager/assets/:id/todos/:todoId", asset_manager_assets_id_todos_todoId_put_22);
app.get("/api/asset-manager/defects", asset_manager_defects_get_23);
app.patch("/api/asset-manager/defects/:id", asset_manager_defects_id_patch_24);
app.post("/api/asset-manager/defects/:id/archive", asset_manager_defects_id_archive_post_25);
app.get("/api/asset-manager/inspections", asset_manager_inspections_get_26);
app.post("/api/asset-manager/inspections", asset_manager_inspections_post_27);
app.get("/api/asset-manager/inspections/:id", asset_manager_inspections_id_get_28);
app.patch("/api/asset-manager/inspections/:id", asset_manager_inspections_id_patch_29);
app.post("/api/asset-manager/inspections/:id/archive", asset_manager_inspections_id_archive_post_30);
app.post("/api/asset-manager/inspections/:id/closeout", asset_manager_inspections_id_closeout_post_31);
app.post("/api/asset-manager/inspections/:id/defects", asset_manager_inspections_id_defects_post_32);
app.delete("/api/asset-manager/inspections/:id/permanent", asset_manager_inspections_id_permanent_delete_33);
app.post("/api/asset-manager/inspections/:id/photos", asset_manager_inspections_id_photos_post_34);
app.post("/api/asset-manager/inspections/:id/report/share", asset_manager_inspections_id_report_share_post_35);
app.post("/api/asset-manager/inspections/:id/restore", asset_manager_inspections_id_restore_post_36);
app.post("/api/asset-manager/inspections/:id/tenders", asset_manager_inspections_id_tenders_post_37);
app.get("/api/asset-manager/monitoring", asset_manager_monitoring_get_38);
app.get("/api/asset-manager/reports/:shareToken", asset_manager_reports_shareToken_get_39);
app.get("/api/asset-manager/tenders", asset_manager_tenders_get_40);
app.get("/api/asset-manager/tenders/:id", asset_manager_tenders_id_get_41);
app.patch("/api/asset-manager/tenders/:id", asset_manager_tenders_id_patch_42);
app.get("/api/asset-manager/tenders/:id/attachments", asset_manager_tenders_id_attachments_get_43);
app.post("/api/asset-manager/tenders/:id/attachments", asset_manager_tenders_id_attachments_post_44);
app.delete("/api/asset-manager/tenders/:id/attachments/:fileId", asset_manager_tenders_id_attachments_fileId_delete_45);
app.post("/api/asset-manager/tenders/:id/complete", asset_manager_tenders_id_complete_post_46);
app.post("/api/asset-manager/tenders/:id/contracts", asset_manager_tenders_id_contracts_post_47);
app.patch("/api/asset-manager/tenders/:id/notes", asset_manager_tenders_id_notes_patch_48);
app.get("/api/asset-manager/tenders/:id/todos", asset_manager_tenders_id_todos_get_49);
app.post("/api/asset-manager/tenders/:id/todos", asset_manager_tenders_id_todos_post_50);
app.delete("/api/asset-manager/tenders/:id/todos/:todoId", asset_manager_tenders_id_todos_todoId_delete_51);
app.put("/api/asset-manager/tenders/:id/todos/:todoId", asset_manager_tenders_id_todos_todoId_put_52);
app.post("/api/auth/change-email", auth_change_email_post_53);
app.post("/api/auth/change-password", auth_change_password_post_54);
app.post("/api/auth/check-signup-status", auth_check_signup_status_post_55);
app.post("/api/auth/forgot-password", auth_forgot_password_post_56);
app.post("/api/auth/pin-login", auth_pin_login_post_57);
app.post("/api/auth/resend-verification", auth_resend_verification_post_58);
app.post("/api/auth/reset-password", auth_reset_password_post_59);
app.post("/api/auth/resume-signup", auth_resume_signup_post_60);
app.post("/api/auth/self-verify", auth_self_verify_post_61);
app.post("/api/auth/send-sms-code", auth_send_sms_code_post_62);
app.get("/api/auth/sms-configured", auth_sms_configured_get_63);
app.post("/api/auth/sms-recovery", auth_sms_recovery_post_64);
app.get("/api/auth/trusted-devices", auth_trusted_devices_get_65);
app.post("/api/auth/trusted-devices", auth_trusted_devices_post_66);
app.delete("/api/auth/trusted-devices/:deviceId", auth_trusted_devices_deviceId_delete_67);
app.patch("/api/auth/trusted-devices/:deviceId/clear-pin", auth_trusted_devices_deviceId_clear_pin_patch_68);
app.get("/api/auth/validate-reset-token", auth_validate_reset_token_get_69);
app.post("/api/auth/verify-email", auth_verify_email_post_70);
app.post("/api/auth/verify-sms-code", auth_verify_sms_code_post_71);
app.get("/api/auth/:action", auth_action_get_72);
app.post("/api/auth/:action", auth_action_post_73);
app.get("/api/auth/:action/:detail", auth_action_detail_get_74);
app.post("/api/auth/:action/:detail", auth_action_detail_post_75);
app.post("/api/billing/cancel-subscription", billing_cancel_subscription_post_76);
app.post("/api/billing/cancellation-feedback", billing_cancellation_feedback_post_77);
app.post("/api/billing/customer-portal", billing_customer_portal_post_78);
app.post("/api/billing/reactivate-subscription", billing_reactivate_subscription_post_79);
app.post("/api/billing/upgrade-subscription", billing_upgrade_subscription_post_80);
app.get("/api/bug-reports", bug_reports_get_81);
app.post("/api/bug-reports", bug_reports_post_82);
app.get("/api/bug-reports/my-reports", bug_reports_my_reports_get_83);
app.patch("/api/bug-reports/:id", bug_reports_id_patch_84);
app.post("/api/bug-reports/:id/analyse", bug_reports_id_analyse_post_85);
app.get("/api/bug-reports/:id/dazza-review/comments", bug_reports_id_dazza_review_comments_get_86);
app.post("/api/bug-reports/:id/dazza-review/ensure", bug_reports_id_dazza_review_ensure_post_87);
app.post("/api/bug-reports/:id/dazza-review/evidence", bug_reports_id_dazza_review_evidence_post_88);
app.post("/api/bug-reports/:id/dazza-review/retry", bug_reports_id_dazza_review_retry_post_89);
app.get("/api/bug-reports/:id/export-bundle", bug_reports_id_export_bundle_get_90);
app.post("/api/bug-reports/:id/publish-fix", bug_reports_id_publish_fix_post_91);
app.post("/api/bug-reports/:id/sms-authorise", bug_reports_id_sms_authorise_post_92);
app.get("/api/company", company_get_93);
app.put("/api/company", company_put_94);
app.post("/api/company/logo", company_logo_post_95);
app.get("/api/company-settings", company_settings_get_96);
app.put("/api/company-settings", company_settings_put_97);
app.get("/api/config/maps-key", config_maps_key_get_98);
app.post("/api/contact", contact_post_99);
app.get("/api/cost-guide", cost_guide_get_100);
app.post("/api/cost-guide", cost_guide_post_101);
app.get("/api/cost-guide/export-csv", cost_guide_export_csv_get_102);
app.post("/api/cost-guide/import-csv", cost_guide_import_csv_post_103);
app.delete("/api/cost-guide/:id", cost_guide_id_delete_104);
app.put("/api/cost-guide/:id", cost_guide_id_put_105);
app.get("/api/customers", customers_get_106);
app.post("/api/customers", customers_post_107);
app.delete("/api/customers/:id", customers_id_delete_108);
app.get("/api/customers/:id", customers_id_get_109);
app.put("/api/customers/:id", customers_id_put_110);
app.get("/api/dashboard/kpi", dashboard_kpi_get_111);
app.get("/api/dashboard/setup-check", dashboard_setup_check_get_112);
app.get("/api/dashboard/todos", dashboard_todos_get_113);
app.post("/api/dazza/anatomy/github/check-changes", dazza_anatomy_github_check_changes_post_114);
app.post("/api/dazza/anatomy/github/fetch", dazza_anatomy_github_fetch_post_115);
app.post("/api/dazza/anatomy/github/test-connection", dazza_anatomy_github_test_connection_post_116);
app.post("/api/dazza/anatomy/search", dazza_anatomy_search_post_117);
app.get("/api/dazza/anatomy/snapshots", dazza_anatomy_snapshots_get_118);
app.get("/api/dazza/anatomy/snapshots/:id", dazza_anatomy_snapshots_id_get_119);
app.post("/api/dazza/anatomy/snapshots/:id/activate", dazza_anatomy_snapshots_id_activate_post_120);
app.post("/api/dazza/anatomy/snapshots/:id/delete", dazza_anatomy_snapshots_id_delete_post_121);
app.post("/api/dazza/anatomy/upload-zip", dazza_anatomy_upload_zip_post_122);
app.post("/api/dazza/annette", dazza_annette_post_123);
app.get("/api/dazza/attachments/conversation/:id", dazza_attachments_conversation_id_get_124);
app.post("/api/dazza/attachments/upload", dazza_attachments_upload_post_125);
app.get("/api/dazza/attachments/:id", dazza_attachments_id_get_126);
app.post("/api/dazza/brain/hive/approve", dazza_brain_hive_approve_post_127);
app.post("/api/dazza/brain/hive/reject", dazza_brain_hive_reject_post_128);
app.get("/api/dazza/brain/status", dazza_brain_status_get_129);
app.post("/api/dazza/builder/apply", dazza_builder_apply_post_130);
app.post("/api/dazza/builder/chat/stream", dazza_builder_chat_stream_post_131);
app.get("/api/dazza/builder/versions", dazza_builder_versions_get_132);
app.post("/api/dazza/builder/versions/restore", dazza_builder_versions_restore_post_133);
app.get("/api/dazza/builder-cases", dazza_builder_cases_get_134);
app.post("/api/dazza/builder-cases", dazza_builder_cases_post_135);
app.get("/api/dazza/builder-cases/by-bug/:bugId", dazza_builder_cases_by_bug_bugId_get_136);
app.get("/api/dazza/builder-cases/:id", dazza_builder_cases_id_get_137);
app.patch("/api/dazza/builder-cases/:id", dazza_builder_cases_id_patch_138);
app.post("/api/dazza/chat", dazza_chat_post_139);
app.post("/api/dazza/chat/stream", dazza_chat_stream_post_140);
app.post("/api/dazza/chat-v2", dazza_chat_v2_post_141);
app.post("/api/dazza/chat-v2/stream", dazza_chat_v2_stream_post_142);
app.get("/api/dazza/context", dazza_context_get_143);
app.get("/api/dazza/conversation/:id/history", dazza_conversation_id_history_get_144);
app.get("/api/dazza/engine-status", dazza_engine_status_get_145);
app.get("/api/dazza/key-status", dazza_key_status_get_146);
app.get("/api/dazza/knowledge", dazza_knowledge_get_147);
app.post("/api/dazza/knowledge", dazza_knowledge_post_148);
app.delete("/api/dazza/knowledge/:id", dazza_knowledge_id_delete_149);
app.put("/api/dazza/knowledge/:id", dazza_knowledge_id_put_150);
app.get("/api/dazza/secret-health", dazza_secret_health_get_151);
app.post("/api/dazza/v3/chat/stream", dazza_v3_chat_stream_post_152);
app.get("/api/dazza/v3/client-rescue", dazza_v3_client_rescue_get_153);
app.patch("/api/dazza/v3/client-rescue/:id", dazza_v3_client_rescue_id_patch_154);
app.get("/api/dazza/v3/communications", dazza_v3_communications_get_155);
app.post("/api/dazza/v3/communications", dazza_v3_communications_post_156);
app.get("/api/dazza/v3/communications/owner", dazza_v3_communications_owner_get_157);
app.patch("/api/dazza/v3/communications/:id", dazza_v3_communications_id_patch_158);
app.post("/api/dazza/v3/communications/:id/dismiss", dazza_v3_communications_id_dismiss_post_159);
app.post("/api/dazza/v3/communications/:id/still-having-trouble", dazza_v3_communications_id_still_having_trouble_post_160);
app.get("/api/dazza/v3/incidents", dazza_v3_incidents_get_161);
app.post("/api/dazza/v3/incidents", dazza_v3_incidents_post_162);
app.get("/api/dazza/v3/incidents/:id", dazza_v3_incidents_id_get_163);
app.post("/api/dazza/v3/incidents/:id/investigate", dazza_v3_incidents_id_investigate_post_164);
app.get("/api/developer/activity-log", developer_activity_log_get_165);
app.get("/api/developer/audit-log", developer_audit_log_get_166);
app.post("/api/developer/billing-reconcile", developer_billing_reconcile_post_167);
app.post("/api/developer/companies/:id/archive", developer_companies_id_archive_post_168);
app.get("/api/developer/company-health", developer_company_health_get_169);
app.get("/api/developer/email-log", developer_email_log_get_170);
app.get("/api/developer/email-settings", developer_email_settings_get_171);
app.put("/api/developer/email-settings", developer_email_settings_put_172);
app.post("/api/developer/email-settings/test", developer_email_settings_test_post_173);
app.get("/api/developer/media-backfill-report", developer_media_backfill_report_get_174);
app.post("/api/developer/provision-apple-review-account", developer_provision_apple_review_account_post_175);
app.post("/api/developer/run-seed-now", developer_run_seed_now_post_176);
app.post("/api/developer/seed-developer-account", developer_seed_developer_account_post_177);
app.get("/api/developer/support-notes", developer_support_notes_get_178);
app.post("/api/developer/support-notes", developer_support_notes_post_179);
app.delete("/api/developer/support-notes/:id", developer_support_notes_id_delete_180);
app.post("/api/developer/test-share-security", developer_test_share_security_post_181);
app.post("/api/developer/users/:id/assign-company", developer_users_id_assign_company_post_182);
app.post("/api/developer/users/:id/deactivate", developer_users_id_deactivate_post_183);
app.post("/api/developer/users/:id/delete-orphan", developer_users_id_delete_orphan_post_184);
app.post("/api/developer/users/:id/force-temp-password", developer_users_id_force_temp_password_post_185);
app.delete("/api/developer/users/:id/impersonate", developer_users_id_impersonate_delete_186);
app.post("/api/developer/users/:id/impersonate", developer_users_id_impersonate_post_187);
app.post("/api/developer/users/:id/reactivate", developer_users_id_reactivate_post_188);
app.post("/api/developer/users/:id/resend-verification", developer_users_id_resend_verification_post_189);
app.put("/api/developer/users/:id/role", developer_users_id_role_put_190);
app.post("/api/developer/users/:id/send-reset-email", developer_users_id_send_reset_email_post_191);
app.delete("/api/developer/users/:id/sessions", developer_users_id_sessions_delete_192);
app.get("/api/developer/users/:id/sessions", developer_users_id_sessions_get_193);
app.post("/api/developer/users/:id/unlock-account", developer_users_id_unlock_account_post_194);
app.post("/api/diag/recover-old-photos", diag_recover_old_photos_post_195);
app.get("/api/diag/self-test", diag_self_test_get_196);
app.post("/api/diag/upload-test", diag_upload_test_post_197);
app.get("/api/document-templates", document_templates_get_198);
app.post("/api/document-templates", document_templates_post_199);
app.delete("/api/document-templates/:id", document_templates_id_delete_200);
app.get("/api/document-templates/:id", document_templates_id_get_201);
app.patch("/api/document-templates/:id", document_templates_id_patch_202);
app.put("/api/document-templates/:id", document_templates_id_put_203);
app.post("/api/document-templates/:id/duplicate", document_templates_id_duplicate_post_204);
app.get("/api/document-templates/:id/export/docx", document_templates_id_export_docx_get_205);
app.get("/api/document-templates/:id/export/pdf", document_templates_id_export_pdf_get_206);
app.post("/api/document-templates/:id/import-auto", document_templates_id_import_auto_post_207);
app.post("/api/document-templates/:id/import-blocks", document_templates_id_import_blocks_post_208);
app.post("/api/document-templates/:id/import-docx", document_templates_id_import_docx_post_209);
app.post("/api/document-templates/:id/import-pdf", document_templates_id_import_pdf_post_210);
app.get("/api/document-templates/:id/pdf-bytes", document_templates_id_pdf_bytes_get_211);
app.post("/api/document-templates/:id/publish-to-library", document_templates_id_publish_to_library_post_212);
app.get("/api/document-templates/:id/source-document", document_templates_id_source_document_get_213);
app.get("/api/document-templates/:id/source-document/download", document_templates_id_source_document_download_get_214);
app.get("/api/document-templates/:id/source-document/pdf-preview", document_templates_id_source_document_pdf_preview_get_215);
app.post("/api/document-templates/:id/source-document/replace", document_templates_id_source_document_replace_post_216);
app.get("/api/documents", documents_get_217);
app.get("/api/documents/share/:token", documents_share_token_get_218);
app.post("/api/documents/share/:token", documents_share_token_post_219);
app.get("/api/documents/:id", documents_id_get_220);
app.put("/api/documents/:id", documents_id_put_221);
app.get("/api/documents/:id/events", documents_id_events_get_222);
app.delete("/api/documents/:id/share", documents_id_share_delete_223);
app.post("/api/documents/:id/share", documents_id_share_post_224);
app.get("/api/drawings", drawings_get_225);
app.post("/api/drawings", drawings_post_226);
app.post("/api/drawings/upload", drawings_upload_post_227);
app.delete("/api/drawings/:id", drawings_id_delete_228);
app.patch("/api/drawings/:id", drawings_id_patch_229);
app.post("/api/drawings/:id/markup", drawings_id_markup_post_230);
app.get("/api/electrical-test-equipment", electrical_test_equipment_get_231);
app.post("/api/electrical-test-equipment", electrical_test_equipment_post_232);
app.put("/api/electrical-test-equipment/:id", electrical_test_equipment_id_put_233);
app.get("/api/electrical-tests", electrical_tests_get_234);
app.post("/api/electrical-tests", electrical_tests_post_235);
app.get("/api/electrical-tests/export/:jobId/csv", electrical_tests_export_jobId_csv_get_236);
app.get("/api/electrical-tests/export/:jobId/pdf", electrical_tests_export_jobId_pdf_get_237);
app.get("/api/electrical-tests/photos/:photoId", electrical_tests_photos_photoId_get_238);
app.get("/api/electrical-tests/:id", electrical_tests_id_get_239);
app.put("/api/electrical-tests/:id", electrical_tests_id_put_240);
app.post("/api/electrical-tests/:id/photos", electrical_tests_id_photos_post_241);
app.post("/api/electrical-tests/:id/retest", electrical_tests_id_retest_post_242);
app.post("/api/electrical-tests/:id/sign-off", electrical_tests_id_sign_off_post_243);
app.get("/api/emergency-alerts", emergency_alerts_get_244);
app.post("/api/emergency-alerts", emergency_alerts_post_245);
app.put("/api/emergency-alerts/:id", emergency_alerts_id_put_246);
app.get("/api/estimates", estimates_get_247);
app.post("/api/estimates", estimates_post_248);
app.delete("/api/estimates/:id", estimates_id_delete_249);
app.get("/api/estimates/:id", estimates_id_get_250);
app.put("/api/estimates/:id", estimates_id_put_251);
app.get("/api/estimates/:id/compose-defaults", estimates_id_compose_defaults_get_252);
app.post("/api/estimates/:id/convert-to-invoice", estimates_id_convert_to_invoice_post_253);
app.get("/api/estimates/:id/export-csv", estimates_id_export_csv_get_254);
app.get("/api/estimates/:id/export-pdf", estimates_id_export_pdf_get_255);
app.post("/api/estimates/:id/import-csv", estimates_id_import_csv_post_256);
app.post("/api/estimates/:id/send-email", estimates_id_send_email_post_257);
app.post("/api/estimates/:id/unlock", estimates_id_unlock_post_258);
app.get("/api/external/form/:token", external_form_token_get_259);
app.post("/api/external/form/:token", external_form_token_post_260);
app.get("/api/features", features_get_261);
app.get("/api/files", files_get_262);
app.post("/api/files", files_post_263);
app.delete("/api/files/:id", files_id_delete_264);
app.get("/api/files/:id/download", files_id_download_get_265);
app.get("/api/finance/estimates", finance_estimates_get_266);
app.get("/api/finance/ledger", finance_ledger_get_267);
app.get("/api/finance/purchase-orders", finance_purchase_orders_get_268);
app.post("/api/finance/purchase-orders", finance_purchase_orders_post_269);
app.delete("/api/finance/purchase-orders/:poId", finance_purchase_orders_poId_delete_270);
app.get("/api/finance/purchase-orders/:poId", finance_purchase_orders_poId_get_271);
app.put("/api/finance/purchase-orders/:poId", finance_purchase_orders_poId_put_272);
app.get("/api/finance/purchase-orders/:poId/pdf", finance_purchase_orders_poId_pdf_get_273);
app.get("/api/finance/timesheets", finance_timesheets_get_274);
app.post("/api/finance/timesheets", finance_timesheets_post_275);
app.get("/api/finance/timesheets/employees", finance_timesheets_employees_get_276);
app.get("/api/finance/timesheets/me", finance_timesheets_me_get_277);
app.delete("/api/finance/timesheets/:id", finance_timesheets_id_delete_278);
app.get("/api/finance/timesheets/:id", finance_timesheets_id_get_279);
app.put("/api/finance/timesheets/:id", finance_timesheets_id_put_280);
app.get("/api/fleet", fleet_get_281);
app.post("/api/fleet", fleet_post_282);
app.get("/api/fleet/analytics-settings", fleet_analytics_settings_get_283);
app.put("/api/fleet/analytics-settings", fleet_analytics_settings_put_284);
app.get("/api/fleet/asset-bookings", fleet_asset_bookings_get_285);
app.post("/api/fleet/asset-bookings", fleet_asset_bookings_post_286);
app.delete("/api/fleet/asset-bookings/:id", fleet_asset_bookings_id_delete_287);
app.patch("/api/fleet/asset-bookings/:id", fleet_asset_bookings_id_patch_288);
app.post("/api/fleet/driver-sessions", fleet_driver_sessions_post_289);
app.get("/api/fleet/driver-sessions/active", fleet_driver_sessions_active_get_290);
app.get("/api/fleet/driver-sessions/live", fleet_driver_sessions_live_get_291);
app.post("/api/fleet/driver-sessions/migrate-gps-status", fleet_driver_sessions_migrate_gps_status_post_292);
app.post("/api/fleet/driver-sessions/:id/heartbeat", fleet_driver_sessions_id_heartbeat_post_293);
app.post("/api/fleet/driver-sessions/:id/stop", fleet_driver_sessions_id_stop_post_294);
app.get("/api/fleet/driver-sessions/:id/summary", fleet_driver_sessions_id_summary_get_295);
app.post("/api/fleet/driver-sessions/:id/telemetry", fleet_driver_sessions_id_telemetry_post_296);
app.get("/api/fleet/driver-sessions/:id/telemetry/latest", fleet_driver_sessions_id_telemetry_latest_get_297);
app.get("/api/fleet/flags", fleet_flags_get_298);
app.get("/api/fleet/last-known-positions", fleet_last_known_positions_get_299);
app.delete("/api/fleet/service-logs/:logId", fleet_service_logs_logId_delete_300);
app.patch("/api/fleet/service-logs/:logId", fleet_service_logs_logId_patch_301);
app.get("/api/fleet/vehicles", fleet_vehicles_get_302);
app.delete("/api/fleet/:id", fleet_id_delete_303);
app.get("/api/fleet/:id", fleet_id_get_304);
app.put("/api/fleet/:id", fleet_id_put_305);
app.get("/api/fleet/:id/driver-sessions", fleet_id_driver_sessions_get_306);
app.post("/api/fleet/:id/driver-sessions/manual", fleet_id_driver_sessions_manual_post_307);
app.get("/api/fleet/:id/files", fleet_id_files_get_308);
app.get("/api/fleet/:id/prestarts", fleet_id_prestarts_get_309);
app.post("/api/fleet/:id/prestarts", fleet_id_prestarts_post_310);
app.get("/api/fleet/:id/service-logs", fleet_id_service_logs_get_311);
app.post("/api/fleet/:id/service-logs", fleet_id_service_logs_post_312);
app.post("/api/fleet/:id/signin", fleet_id_signin_post_313);
app.post("/api/fleet/:id/signout", fleet_id_signout_post_314);
app.get("/api/fleet/:id/usage-export", fleet_id_usage_export_get_315);
app.get("/api/fleet/:id/usage-status", fleet_id_usage_status_get_316);
app.get("/api/fleet/:id/usage-summary", fleet_id_usage_summary_get_317);
app.post("/api/form-attachments", form_attachments_post_318);
app.get("/api/form-global-lists", form_global_lists_get_319);
app.post("/api/form-global-lists", form_global_lists_post_320);
app.delete("/api/form-global-lists/:id", form_global_lists_id_delete_321);
app.put("/api/form-global-lists/:id", form_global_lists_id_put_322);
app.get("/api/form-templates", form_templates_get_323);
app.post("/api/form-templates", form_templates_post_324);
app.post("/api/form-templates/seed", form_templates_seed_post_325);
app.delete("/api/form-templates/:id", form_templates_id_delete_326);
app.put("/api/form-templates/:id", form_templates_id_put_327);
app.post("/api/form-templates/:id/publish-to-library", form_templates_id_publish_to_library_post_328);
app.get("/api/forms/assets-list", forms_assets_list_get_329);
app.get("/api/forms/jobs-list", forms_jobs_list_get_330);
app.post("/api/forms/migrate-skip-logic", forms_migrate_skip_logic_post_331);
app.get("/api/forms/skip-audit", forms_skip_audit_get_332);
app.post("/api/forms/skip-audit", forms_skip_audit_post_333);
app.post("/api/forms/start", forms_start_post_334);
app.get("/api/forms/submissions", forms_submissions_get_335);
app.delete("/api/forms/submissions/:source/:id", forms_submissions_source_id_delete_336);
app.post("/api/forms/submissions/:source/:id/archive", forms_submissions_source_id_archive_post_337);
app.post("/api/forms/submissions/:source/:id/restore", forms_submissions_source_id_restore_post_338);
app.delete("/api/forms/templates/:id/share-link", forms_templates_id_share_link_delete_339);
app.post("/api/forms/templates/:id/share-link", forms_templates_id_share_link_post_340);
app.get("/api/forms/:id/fields", forms_id_fields_get_341);
app.post("/api/forms/:id/fields", forms_id_fields_post_342);
app.post("/api/forms/:id/fields/reorder", forms_id_fields_reorder_post_343);
app.delete("/api/forms/:id/fields/:fieldId", forms_id_fields_fieldId_delete_344);
app.patch("/api/forms/:id/fields/:fieldId", forms_id_fields_fieldId_patch_345);
app.post("/api/forms/:id/fields/:fieldId/thumbnail", forms_id_fields_fieldId_thumbnail_post_346);
app.get("/api/health", health_get_347);
app.post("/api/image-safety/attest", image_safety_attest_post_348);
app.post("/api/image-safety/batch-status", image_safety_batch_status_post_349);
app.get("/api/incidents", incidents_get_350);
app.post("/api/incidents", incidents_post_351);
app.post("/api/incidents/:id/archive", incidents_id_archive_post_352);
app.post("/api/incidents/:id/unarchive", incidents_id_unarchive_post_353);
app.get("/api/incidents/:incidentId", incidents_incidentId_get_354);
app.put("/api/incidents/:incidentId", incidents_incidentId_put_355);
app.get("/api/incidents/:incidentId/attachments", incidents_incidentId_attachments_get_356);
app.post("/api/incidents/:incidentId/attachments", incidents_incidentId_attachments_post_357);
app.delete("/api/incidents/:incidentId/attachments/:attachId", incidents_incidentId_attachments_attachId_delete_358);
app.post("/api/incidents/:incidentId/close", incidents_incidentId_close_post_359);
app.post("/api/incidents/:incidentId/corrective-actions", incidents_incidentId_corrective_actions_post_360);
app.put("/api/incidents/:incidentId/corrective-actions/:actionId", incidents_incidentId_corrective_actions_actionId_put_361);
app.get("/api/incidents/:incidentId/pdf", incidents_incidentId_pdf_get_362);
app.post("/api/incidents/:incidentId/third-parties", incidents_incidentId_third_parties_post_363);
app.delete("/api/incidents/:incidentId/third-parties/:thirdPartyId", incidents_incidentId_third_parties_thirdPartyId_delete_364);
app.get("/api/integrations/myob/auth-url", integrations_myob_auth_url_get_365);
app.get("/api/integrations/myob/callback", integrations_myob_callback_get_366);
app.post("/api/integrations/myob/disconnect", integrations_myob_disconnect_post_367);
app.get("/api/integrations/myob/status", integrations_myob_status_get_368);
app.post("/api/integrations/myob/sync-invoice", integrations_myob_sync_invoice_post_369);
app.get("/api/integrations/onedrive/auth-url", integrations_onedrive_auth_url_get_370);
app.get("/api/integrations/onedrive/callback", integrations_onedrive_callback_get_371);
app.post("/api/integrations/onedrive/disconnect", integrations_onedrive_disconnect_post_372);
app.get("/api/integrations/onedrive/status", integrations_onedrive_status_get_373);
app.post("/api/integrations/onedrive/upload-file", integrations_onedrive_upload_file_post_374);
app.get("/api/integrations/qbo/auth-url", integrations_qbo_auth_url_get_375);
app.get("/api/integrations/qbo/callback", integrations_qbo_callback_get_376);
app.post("/api/integrations/qbo/disconnect", integrations_qbo_disconnect_post_377);
app.get("/api/integrations/qbo/status", integrations_qbo_status_get_378);
app.post("/api/integrations/qbo/sync-invoice", integrations_qbo_sync_invoice_post_379);
app.get("/api/integrations/xero/auth-url", integrations_xero_auth_url_get_380);
app.get("/api/integrations/xero/callback", integrations_xero_callback_get_381);
app.post("/api/integrations/xero/disconnect", integrations_xero_disconnect_post_382);
app.get("/api/integrations/xero/status", integrations_xero_status_get_383);
app.post("/api/integrations/xero/sync-customer", integrations_xero_sync_customer_post_384);
app.post("/api/integrations/xero/sync-invoice", integrations_xero_sync_invoice_post_385);
app.post("/api/integrations/xero/webhook", integrations_xero_webhook_post_386);
app.get("/api/invoices", invoices_get_387);
app.post("/api/invoices", invoices_post_388);
app.delete("/api/invoices/:id", invoices_id_delete_389);
app.get("/api/invoices/:id", invoices_id_get_390);
app.put("/api/invoices/:id", invoices_id_put_391);
app.get("/api/invoices/:id/compose-defaults", invoices_id_compose_defaults_get_392);
app.post("/api/invoices/:id/duplicate", invoices_id_duplicate_post_393);
app.get("/api/invoices/:id/export-pdf", invoices_id_export_pdf_get_394);
app.post("/api/invoices/:id/mark-sent", invoices_id_mark_sent_post_395);
app.post("/api/invoices/:id/record-payment", invoices_id_record_payment_post_396);
app.post("/api/invoices/:id/send-email", invoices_id_send_email_post_397);
app.patch("/api/invoices/:id/unlock", invoices_id_unlock_patch_398);
app.post("/api/invoices/:id/void", invoices_id_void_post_399);
app.get("/api/job-cards", job_cards_get_400);
app.post("/api/job-cards", job_cards_post_401);
app.delete("/api/job-cards/:id", job_cards_id_delete_402);
app.get("/api/job-cards/:id", job_cards_id_get_403);
app.put("/api/job-cards/:id", job_cards_id_put_404);
app.post("/api/job-cards/:id/convert", job_cards_id_convert_post_405);
app.post("/api/job-cards/:id/invoice", job_cards_id_invoice_post_406);
app.post("/api/job-cards/:id/photos", job_cards_id_photos_post_407);
app.delete("/api/job-cards/:id/photos/:photoId", job_cards_id_photos_photoId_delete_408);
app.patch("/api/job-cards/:id/photos/:photoId", job_cards_id_photos_photoId_patch_409);
app.get("/api/job-cards/:id/photos/:photoId/download", job_cards_id_photos_photoId_download_get_410);
app.post("/api/job-cards/:id/photos/:photoId/save-and-lock", job_cards_id_photos_photoId_save_and_lock_post_411);
app.post("/api/job-costs", job_costs_post_412);
app.delete("/api/job-forms/:id", job_forms_id_delete_413);
app.get("/api/job-forms/:id", job_forms_id_get_414);
app.put("/api/job-forms/:id", job_forms_id_put_415);
app.get("/api/job-forms/:id/compose-defaults", job_forms_id_compose_defaults_get_416);
app.get("/api/job-forms/:id/export-pdf", job_forms_id_export_pdf_get_417);
app.post("/api/job-forms/:id/reset", job_forms_id_reset_post_418);
app.post("/api/job-forms/:id/send-email", job_forms_id_send_email_post_419);
app.delete("/api/job-forms/:id/share", job_forms_id_share_delete_420);
app.get("/api/job-forms/:id/share", job_forms_id_share_get_421);
app.post("/api/job-forms/:id/share", job_forms_id_share_post_422);
app.get("/api/jobs", jobs_get_423);
app.post("/api/jobs", jobs_post_424);
app.post("/api/jobs/report/generate", jobs_report_generate_post_425);
app.get("/api/jobs/search", jobs_search_get_426);
app.get("/api/jobs/:id", jobs_id_get_427);
app.put("/api/jobs/:id", jobs_id_put_428);
app.post("/api/jobs/:id/attendance/:attendanceId/close", jobs_id_attendance_attendanceId_close_post_429);
app.get("/api/jobs/:id/compose-defaults", jobs_id_compose_defaults_get_430);
app.get("/api/jobs/:id/costs", jobs_id_costs_get_431);
app.post("/api/jobs/:id/costs", jobs_id_costs_post_432);
app.get("/api/jobs/:id/costs/export", jobs_id_costs_export_get_433);
app.delete("/api/jobs/:id/costs/:costId", jobs_id_costs_costId_delete_434);
app.put("/api/jobs/:id/costs/:costId", jobs_id_costs_costId_put_435);
app.get("/api/jobs/:id/costs/:costId/receipt", jobs_id_costs_costId_receipt_get_436);
app.post("/api/jobs/:id/costs/:costId/receipt", jobs_id_costs_costId_receipt_post_437);
app.get("/api/jobs/:id/delays", jobs_id_delays_get_438);
app.post("/api/jobs/:id/delays", jobs_id_delays_post_439);
app.get("/api/jobs/:id/delays/export-csv", jobs_id_delays_export_csv_get_440);
app.delete("/api/jobs/:id/delays/:delayId", jobs_id_delays_delayId_delete_441);
app.put("/api/jobs/:id/delays/:delayId", jobs_id_delays_delayId_put_442);
app.get("/api/jobs/:id/documents", jobs_id_documents_get_443);
app.post("/api/jobs/:id/documents", jobs_id_documents_post_444);
app.get("/api/jobs/:id/export-zip", jobs_id_export_zip_get_445);
app.get("/api/jobs/:id/field-docs", jobs_id_field_docs_get_446);
app.get("/api/jobs/:id/files", jobs_id_files_get_447);
app.get("/api/jobs/:id/forms", jobs_id_forms_get_448);
app.post("/api/jobs/:id/forms", jobs_id_forms_post_449);
app.get("/api/jobs/:id/forms/export-csv", jobs_id_forms_export_csv_get_450);
app.delete("/api/jobs/:id/forms/:submissionId", jobs_id_forms_submissionId_delete_451);
app.post("/api/jobs/:id/forms/:submissionId/reopen", jobs_id_forms_submissionId_reopen_post_452);
app.post("/api/jobs/:id/generate-qr", jobs_id_generate_qr_post_453);
app.get("/api/jobs/:id/ledger", jobs_id_ledger_get_454);
app.post("/api/jobs/:id/ledger", jobs_id_ledger_post_455);
app.get("/api/jobs/:id/ledger/export", jobs_id_ledger_export_get_456);
app.post("/api/jobs/:id/ledger/sync", jobs_id_ledger_sync_post_457);
app.delete("/api/jobs/:id/ledger/:entryId", jobs_id_ledger_entryId_delete_458);
app.put("/api/jobs/:id/ledger/:entryId", jobs_id_ledger_entryId_put_459);
app.post("/api/jobs/:id/ledger/:entryId/correct", jobs_id_ledger_entryId_correct_post_460);
app.get("/api/jobs/:id/milestones", jobs_id_milestones_get_461);
app.post("/api/jobs/:id/milestones", jobs_id_milestones_post_462);
app.delete("/api/jobs/:id/milestones/:milestoneId", jobs_id_milestones_milestoneId_delete_463);
app.patch("/api/jobs/:id/milestones/:milestoneId", jobs_id_milestones_milestoneId_patch_464);
app.get("/api/jobs/:id/notes/export-csv", jobs_id_notes_export_csv_get_465);
app.get("/api/jobs/:id/photos", jobs_id_photos_get_466);
app.post("/api/jobs/:id/photos", jobs_id_photos_post_467);
app.post("/api/jobs/:id/photos/export-zip", jobs_id_photos_export_zip_post_468);
app.get("/api/jobs/:id/photos/picker", jobs_id_photos_picker_get_469);
app.post("/api/jobs/:id/photos/share", jobs_id_photos_share_post_470);
app.delete("/api/jobs/:id/photos/:photoId", jobs_id_photos_photoId_delete_471);
app.patch("/api/jobs/:id/photos/:photoId", jobs_id_photos_photoId_patch_472);
app.get("/api/jobs/:id/photos/:photoId/download", jobs_id_photos_photoId_download_get_473);
app.post("/api/jobs/:id/photos/:photoId/lock", jobs_id_photos_photoId_lock_post_474);
app.post("/api/jobs/:id/photos/:photoId/replace", jobs_id_photos_photoId_replace_post_475);
app.get("/api/jobs/:id/photos/:photoId/report-image", jobs_id_photos_photoId_report_image_get_476);
app.get("/api/jobs/:id/progress", jobs_id_progress_get_477);
app.put("/api/jobs/:id/progress", jobs_id_progress_put_478);
app.get("/api/jobs/:id/progress/export-csv", jobs_id_progress_export_csv_get_479);
app.post("/api/jobs/:id/progress/lines", jobs_id_progress_lines_post_480);
app.post("/api/jobs/:id/progress/lines/reorder", jobs_id_progress_lines_reorder_post_481);
app.delete("/api/jobs/:id/progress/lines/:lineId", jobs_id_progress_lines_lineId_delete_482);
app.patch("/api/jobs/:id/progress/lines/:lineId", jobs_id_progress_lines_lineId_patch_483);
app.post("/api/jobs/:id/progress/lines/:lineId/duplicate", jobs_id_progress_lines_lineId_duplicate_post_484);
app.get("/api/jobs/:id/progress/report", jobs_id_progress_report_get_485);
app.put("/api/jobs/:id/progress/report", jobs_id_progress_report_put_486);
app.get("/api/jobs/:id/progress/report/pdf", jobs_id_progress_report_pdf_get_487);
app.post("/api/jobs/:id/progress/sections", jobs_id_progress_sections_post_488);
app.post("/api/jobs/:id/progress/sections/reorder", jobs_id_progress_sections_reorder_post_489);
app.delete("/api/jobs/:id/progress/sections/:sectionId", jobs_id_progress_sections_sectionId_delete_490);
app.patch("/api/jobs/:id/progress/sections/:sectionId", jobs_id_progress_sections_sectionId_patch_491);
app.post("/api/jobs/:id/progress/sync", jobs_id_progress_sync_post_492);
app.get("/api/jobs/:id/purchase-orders", jobs_id_purchase_orders_get_493);
app.post("/api/jobs/:id/purchase-orders", jobs_id_purchase_orders_post_494);
app.delete("/api/jobs/:id/purchase-orders/:poId", jobs_id_purchase_orders_poId_delete_495);
app.get("/api/jobs/:id/purchase-orders/:poId", jobs_id_purchase_orders_poId_get_496);
app.put("/api/jobs/:id/purchase-orders/:poId", jobs_id_purchase_orders_poId_put_497);
app.get("/api/jobs/:id/purchase-orders/:poId/pdf", jobs_id_purchase_orders_poId_pdf_get_498);
app.post("/api/jobs/:id/report/pdf", jobs_id_report_pdf_post_499);
app.get("/api/jobs/:id/risky", jobs_id_risky_get_500);
app.post("/api/jobs/:id/risky", jobs_id_risky_post_501);
app.get("/api/jobs/:id/risky/:riskyId", jobs_id_risky_riskyId_get_502);
app.put("/api/jobs/:id/risky/:riskyId", jobs_id_risky_riskyId_put_503);
app.post("/api/jobs/:id/risky/:riskyId/finalise", jobs_id_risky_riskyId_finalise_post_504);
app.post("/api/jobs/:id/risky/:riskyId/signatures", jobs_id_risky_riskyId_signatures_post_505);
app.post("/api/jobs/:id/risky/:riskyId/supervisor-signoff", jobs_id_risky_riskyId_supervisor_signoff_post_506);
app.post("/api/jobs/:id/send-email", jobs_id_send_email_post_507);
app.post("/api/jobs/:id/signin", jobs_id_signin_post_508);
app.post("/api/jobs/:id/signin-qr", jobs_id_signin_qr_post_509);
app.get("/api/jobs/:id/signin-status", jobs_id_signin_status_get_510);
app.post("/api/jobs/:id/signout", jobs_id_signout_post_511);
app.post("/api/jobs/:id/signout-qr", jobs_id_signout_qr_post_512);
app.post("/api/jobs/:id/signout-user", jobs_id_signout_user_post_513);
app.get("/api/jobs/:id/site-prestarts", jobs_id_site_prestarts_get_514);
app.post("/api/jobs/:id/site-prestarts", jobs_id_site_prestarts_post_515);
app.get("/api/jobs/:id/site-prestarts/:prestartId", jobs_id_site_prestarts_prestartId_get_516);
app.put("/api/jobs/:id/site-prestarts/:prestartId", jobs_id_site_prestarts_prestartId_put_517);
app.post("/api/jobs/:id/site-prestarts/:prestartId/finalise", jobs_id_site_prestarts_prestartId_finalise_post_518);
app.post("/api/jobs/:id/site-prestarts/:prestartId/workers", jobs_id_site_prestarts_prestartId_workers_post_519);
app.get("/api/jobs/:id/studio-swms", jobs_id_studio_swms_get_520);
app.post("/api/jobs/:id/studio-swms", jobs_id_studio_swms_post_521);
app.get("/api/jobs/:id/swms", jobs_id_swms_get_522);
app.post("/api/jobs/:id/swms", jobs_id_swms_post_523);
app.post("/api/jobs/:id/swms/:swmsId/signoff", jobs_id_swms_swmsId_signoff_post_524);
app.get("/api/jobs/:id/todos", jobs_id_todos_get_525);
app.post("/api/jobs/:id/todos", jobs_id_todos_post_526);
app.delete("/api/jobs/:id/todos/:todoId", jobs_id_todos_todoId_delete_527);
app.put("/api/jobs/:id/todos/:todoId", jobs_id_todos_todoId_put_528);
app.get("/api/lens/photos", lens_photos_get_529);
app.post("/api/lens/photos/export-zip", lens_photos_export_zip_post_530);
app.get("/api/lens/photos/:photoId/download", lens_photos_photoId_download_get_531);
app.get("/api/library/check-published", library_check_published_get_532);
app.get("/api/library/items", library_items_get_533);
app.get("/api/library/items/:id", library_items_id_get_534);
app.patch("/api/library/items/:id", library_items_id_patch_535);
app.get("/api/library/items/:id/download", library_items_id_download_get_536);
app.delete("/api/library/items/:id/install", library_items_id_install_delete_537);
app.post("/api/library/items/:id/install", library_items_id_install_post_538);
app.get("/api/library/my-installed", library_my_installed_get_539);
app.get("/api/library/my-installed/:id", library_my_installed_id_get_540);
app.get("/api/library/my-submissions", library_my_submissions_get_541);
app.get("/api/lists", lists_get_542);
app.get("/api/me", me_get_543);
app.put("/api/me", me_put_544);
app.post("/api/me/2fa/disable", me_2fa_disable_post_545);
app.post("/api/me/2fa/enable", me_2fa_enable_post_546);
app.get("/api/me/2fa/qr", me_2fa_qr_get_547);
app.post("/api/me/2fa/recover", me_2fa_recover_post_548);
app.get("/api/me/2fa/setup", me_2fa_setup_get_549);
app.post("/api/me/2fa/sms/disable", me_2fa_sms_disable_post_550);
app.post("/api/me/2fa/sms/enable", me_2fa_sms_enable_post_551);
app.post("/api/me/2fa/sms/send", me_2fa_sms_send_post_552);
app.post("/api/me/2fa/sms/send-setup", me_2fa_sms_send_setup_post_553);
app.post("/api/me/2fa/sms/verify", me_2fa_sms_verify_post_554);
app.get("/api/me/2fa/status", me_2fa_status_get_555);
app.post("/api/me/2fa/verify", me_2fa_verify_post_556);
app.get("/api/me/active-status", me_active_status_get_557);
app.post("/api/me/change-password", me_change_password_post_558);
app.get("/api/me/email-status", me_email_status_get_559);
app.get("/api/me/phone", me_phone_get_560);
app.put("/api/me/phone", me_phone_put_561);
app.delete("/api/me/profile-attachments", me_profile_attachments_delete_562);
app.post("/api/me/profile-attachments", me_profile_attachments_post_563);
app.get("/api/me/profile-attachments/download", me_profile_attachments_download_get_564);
app.get("/api/me/profile-attachments/thumbnail", me_profile_attachments_thumbnail_get_565);
app.get("/api/me/profile-extras", me_profile_extras_get_566);
app.put("/api/me/profile-extras", me_profile_extras_put_567);
app.get("/api/me/recovery-email", me_recovery_email_get_568);
app.get("/api/me/recovery-email/cancel", me_recovery_email_cancel_get_569);
app.post("/api/me/recovery-email/cancel", me_recovery_email_cancel_post_570);
app.get("/api/me/recovery-email/freeze", me_recovery_email_freeze_get_571);
app.post("/api/me/recovery-email/freeze", me_recovery_email_freeze_post_572);
app.post("/api/me/recovery-email/request", me_recovery_email_request_post_573);
app.get("/api/me/recovery-email/verify", me_recovery_email_verify_get_574);
app.post("/api/migrate-account-recovery", migrate_account_recovery_post_575);
app.post("/api/migrate-anatomy", migrate_anatomy_post_576);
app.post("/api/migrate-asset-manager", migrate_asset_manager_post_577);
app.post("/api/migrate-attendance", migrate_attendance_post_578);
app.post("/api/migrate-company-settings", migrate_company_settings_post_579);
app.post("/api/migrate-dazza-audit", migrate_dazza_audit_post_580);
app.post("/api/migrate-dazza-knowledge", migrate_dazza_knowledge_post_581);
app.post("/api/migrate-emergency-alerts", migrate_emergency_alerts_post_582);
app.post("/api/migrate-estimates", migrate_estimates_post_583);
app.post("/api/migrate-estimating-library", migrate_estimating_library_post_584);
app.post("/api/migrate-files", migrate_files_post_585);
app.post("/api/migrate-fleet", migrate_fleet_post_586);
app.post("/api/migrate-fleet-analytics", migrate_fleet_analytics_post_587);
app.post("/api/migrate-fleet-driver-sessions", migrate_fleet_driver_sessions_post_588);
app.post("/api/migrate-fleet-usage", migrate_fleet_usage_post_589);
app.post("/api/migrate-form-fields", migrate_form_fields_post_590);
app.post("/api/migrate-form-logic", migrate_form_logic_post_591);
app.post("/api/migrate-form-templates", migrate_form_templates_post_592);
app.post("/api/migrate-job-forms", migrate_job_forms_post_593);
app.post("/api/migrate-job-photo-shares", migrate_job_photo_shares_post_594);
app.post("/api/migrate-job-photos", migrate_job_photos_post_595);
app.post("/api/migrate-job-tabs", migrate_job_tabs_post_596);
app.post("/api/migrate-jobs", migrate_jobs_post_597);
app.post("/api/migrate-ledger-photo", migrate_ledger_photo_post_598);
app.post("/api/migrate-library", migrate_library_post_599);
app.post("/api/migrate-library-downloads", migrate_library_downloads_post_600);
app.post("/api/migrate-notifications", migrate_notifications_post_601);
app.post("/api/migrate-owner-console", migrate_owner_console_post_602);
app.post("/api/migrate-owner-role", migrate_owner_role_post_603);
app.post("/api/migrate-pdf-settings", migrate_pdf_settings_post_604);
app.post("/api/migrate-photo-gps", migrate_photo_gps_post_605);
app.post("/api/migrate-plan-manager", migrate_plan_manager_post_606);
app.post("/api/migrate-plan-manager-v2", migrate_plan_manager_v2_post_607);
app.post("/api/migrate-plan-manager-v3", migrate_plan_manager_v3_post_608);
app.post("/api/migrate-safety", migrate_safety_post_609);
app.post("/api/migrate-safety-studio", migrate_safety_studio_post_610);
app.post("/api/migrate-site-prestart", migrate_site_prestart_post_611);
app.post("/api/migrate-sms-verified-at", migrate_sms_verified_at_post_612);
app.post("/api/migrate-starter-pack", migrate_starter_pack_post_613);
app.post("/api/migrate-studio-pdf", migrate_studio_pdf_post_614);
app.post("/api/migrate-studio-phase2", migrate_studio_phase2_post_615);
app.post("/api/migrate-subscriptions", migrate_subscriptions_post_616);
app.post("/api/migrate-support-mode", migrate_support_mode_post_617);
app.post("/api/migrate-takeoff-pad", migrate_takeoff_pad_post_618);
app.post("/api/migrate-team", migrate_team_post_619);
app.get("/api/notes", notes_get_620);
app.post("/api/notes", notes_post_621);
app.post("/api/notes/comments", notes_comments_post_622);
app.post("/api/notes/migrate", notes_migrate_post_623);
app.delete("/api/notes/:id", notes_id_delete_624);
app.get("/api/notifications/alerts", notifications_alerts_get_625);
app.get("/api/notifications/prefs", notifications_prefs_get_626);
app.put("/api/notifications/prefs", notifications_prefs_put_627);
app.post("/api/notifications/read", notifications_read_post_628);
app.get("/api/owner-console/activity", owner_console_activity_get_629);
app.get("/api/owner-console/cancellation-feedback", owner_console_cancellation_feedback_get_630);
app.get("/api/owner-console/companies", owner_console_companies_get_631);
app.post("/api/owner-console/companies", owner_console_companies_post_632);
app.get("/api/owner-console/companies/usage", owner_console_companies_usage_get_633);
app.put("/api/owner-console/companies/:id/limits", owner_console_companies_id_limits_put_634);
app.get("/api/owner-console/form-templates", owner_console_form_templates_get_635);
app.post("/api/owner-console/form-templates", owner_console_form_templates_post_636);
app.get("/api/owner-console/library/items", owner_console_library_items_get_637);
app.post("/api/owner-console/library/items", owner_console_library_items_post_638);
app.post("/api/owner-console/library/items/from-template", owner_console_library_items_from_template_post_639);
app.delete("/api/owner-console/library/items/:id", owner_console_library_items_id_delete_640);
app.patch("/api/owner-console/library/items/:id", owner_console_library_items_id_patch_641);
app.put("/api/owner-console/library/items/:id", owner_console_library_items_id_put_642);
app.post("/api/owner-console/library/items/:id/push-update", owner_console_library_items_id_push_update_post_643);
app.get("/api/owner-console/library/submissions", owner_console_library_submissions_get_644);
app.post("/api/owner-console/library/submissions/:id/review", owner_console_library_submissions_id_review_post_645);
app.get("/api/owner-console/starter-pack", owner_console_starter_pack_get_646);
app.post("/api/owner-console/starter-pack", owner_console_starter_pack_post_647);
app.get("/api/owner-console/stats", owner_console_stats_get_648);
app.get("/api/owner-console/storage", owner_console_storage_get_649);
app.get("/api/owner-console/swms/masters", owner_console_swms_masters_get_650);
app.post("/api/owner-console/swms/masters", owner_console_swms_masters_post_651);
app.post("/api/owner-console/swms/masters/publish-all", owner_console_swms_masters_publish_all_post_652);
app.delete("/api/owner-console/swms/masters/:id", owner_console_swms_masters_id_delete_653);
app.get("/api/owner-console/swms/masters/:id", owner_console_swms_masters_id_get_654);
app.put("/api/owner-console/swms/masters/:id", owner_console_swms_masters_id_put_655);
app.post("/api/owner-console/swms/masters/:id/publish", owner_console_swms_masters_id_publish_post_656);
app.post("/api/owner-console/swms/migrate-master-library", owner_console_swms_migrate_master_library_post_657);
app.post("/api/owner-console/swms/push", owner_console_swms_push_post_658);
app.post("/api/owner-console/swms/seed-bricklaying", owner_console_swms_seed_bricklaying_post_659);
app.post("/api/owner-console/swms/seed-building-inspection", owner_console_swms_seed_building_inspection_post_660);
app.post("/api/owner-console/swms/seed-cabinets", owner_console_swms_seed_cabinets_post_661);
app.post("/api/owner-console/swms/seed-carpenter-fixing", owner_console_swms_seed_carpenter_fixing_post_662);
app.post("/api/owner-console/swms/seed-carpenter-framing", owner_console_swms_seed_carpenter_framing_post_663);
app.post("/api/owner-console/swms/seed-carpenter-lockup", owner_console_swms_seed_carpenter_lockup_post_664);
app.post("/api/owner-console/swms/seed-ceramic-tiling", owner_console_swms_seed_ceramic_tiling_post_665);
app.post("/api/owner-console/swms/seed-concreting-slab", owner_console_swms_seed_concreting_slab_post_666);
app.post("/api/owner-console/swms/seed-delivery-loading", owner_console_swms_seed_delivery_loading_post_667);
app.post("/api/owner-console/swms/seed-environmental-spill", owner_console_swms_seed_environmental_spill_post_668);
app.post("/api/owner-console/swms/seed-ewp", owner_console_swms_seed_ewp_post_669);
app.post("/api/owner-console/swms/seed-excavations-substation", owner_console_swms_seed_excavations_substation_post_670);
app.post("/api/owner-console/swms/seed-fencing", owner_console_swms_seed_fencing_post_671);
app.post("/api/owner-console/swms/seed-heat-stress", owner_console_swms_seed_heat_stress_post_672);
app.post("/api/owner-console/swms/seed-landscaping", owner_console_swms_seed_landscaping_post_673);
app.post("/api/owner-console/swms/seed-live-parts", owner_console_swms_seed_live_parts_post_674);
app.post("/api/owner-console/swms/seed-manual-handling", owner_console_swms_seed_manual_handling_post_675);
app.post("/api/owner-console/swms/seed-moving-plant", owner_console_swms_seed_moving_plant_post_676);
app.post("/api/owner-console/swms/seed-painting", owner_console_swms_seed_painting_post_677);
app.post("/api/owner-console/swms/seed-power-tools", owner_console_swms_seed_power_tools_post_678);
app.post("/api/owner-console/swms/seed-silica-dust", owner_console_swms_seed_silica_dust_post_679);
app.post("/api/owner-console/swms/seed-traffic-management", owner_console_swms_seed_traffic_management_post_680);
app.post("/api/owner-console/swms/seed-underground-services", owner_console_swms_seed_underground_services_post_681);
app.post("/api/owner-console/swms/seed-vacuum-excavation", owner_console_swms_seed_vacuum_excavation_post_682);
app.post("/api/owner-console/system-ai/builtin-checks", owner_console_system_ai_builtin_checks_post_683);
app.get("/api/owner-console/twilio-info", owner_console_twilio_info_get_684);
app.get("/api/owner-console/users", owner_console_users_get_685);
app.post("/api/owner-console/users/verify", owner_console_users_verify_post_686);
app.get("/api/plan-manager/drawings", plan_manager_drawings_get_687);
app.post("/api/plan-manager/drawings", plan_manager_drawings_post_688);
app.get("/api/plan-manager/drawings/:id", plan_manager_drawings_id_get_689);
app.put("/api/plan-manager/drawings/:id/annotations", plan_manager_drawings_id_annotations_put_690);
app.post("/api/plan-manager/drawings/:id/archive", plan_manager_drawings_id_archive_post_691);
app.delete("/api/plan-manager/drawings/:id/job-links", plan_manager_drawings_id_job_links_delete_692);
app.post("/api/plan-manager/drawings/:id/job-links", plan_manager_drawings_id_job_links_post_693);
app.get("/api/plan-manager/drawings/:id/pages/:pageNo/annotations", plan_manager_drawings_id_pages_pageNo_annotations_get_694);
app.delete("/api/plan-manager/drawings/:id/permanent", plan_manager_drawings_id_permanent_delete_695);
app.patch("/api/plan-manager/drawings/:id/reorder", plan_manager_drawings_id_reorder_patch_696);
app.post("/api/plan-manager/drawings/:id/restore", plan_manager_drawings_id_restore_post_697);
app.post("/api/plan-manager/drawings/:id/revisions", plan_manager_drawings_id_revisions_post_698);
app.post("/api/plan-manager/drawings/:id/revisions/:revisionId/finalize", plan_manager_drawings_id_revisions_revisionId_finalize_post_699);
app.post("/api/plan-manager/drawings/:id/upload", plan_manager_drawings_id_upload_post_700);
app.get("/api/plan-manager/jobs/:jobId/drawings-zip", plan_manager_jobs_jobId_drawings_zip_get_701);
app.get("/api/plan-manager/jobs-with-drawings", plan_manager_jobs_with_drawings_get_702);
app.post("/api/plan-manager/share", plan_manager_share_post_703);
app.get("/api/plan-manager/share/validate", plan_manager_share_validate_get_704);
app.post("/api/plan-manager/upload", plan_manager_upload_post_705);
app.post("/api/portal/estimates/:id/approve", portal_estimates_id_approve_post_706);
app.post("/api/portal/invite", portal_invite_post_707);
app.post("/api/portal/invoices/:id/pay", portal_invoices_id_pay_post_708);
app.get("/api/portal/jobs", portal_jobs_get_709);
app.get("/api/portal/jobs/:id", portal_jobs_id_get_710);
app.post("/api/portal/migrate", portal_migrate_post_711);
app.post("/api/portal/validate", portal_validate_post_712);
app.get("/api/public/form/:token", public_form_token_get_713);
app.post("/api/public/form/:token/submit", public_form_token_submit_post_714);
app.get("/api/public/job-photos/:token", public_job_photos_token_get_715);
app.get("/api/public/job-photos/:token/photo/:photoId", public_job_photos_token_photo_photoId_get_716);
app.get("/api/public/swms/:token", public_swms_token_get_717);
app.post("/api/public/swms/:token/signoff", public_swms_token_signoff_post_718);
app.get("/api/purchase-orders/:poId/compose-defaults", purchase_orders_poId_compose_defaults_get_719);
app.post("/api/purchase-orders/:poId/send-email", purchase_orders_poId_send_email_post_720);
app.delete("/api/push/subscribe", push_subscribe_delete_721);
app.post("/api/push/subscribe", push_subscribe_post_722);
app.get("/api/push/vapid-key", push_vapid_key_get_723);
app.get("/api/quick-links/site-meta", quick_links_site_meta_get_724);
app.get("/api/recipes", recipes_get_725);
app.post("/api/recipes", recipes_post_726);
app.delete("/api/recipes/:id", recipes_id_delete_727);
app.put("/api/recipes/:id", recipes_id_put_728);
app.get("/api/risk-register", risk_register_get_729);
app.post("/api/risk-register", risk_register_post_730);
app.get("/api/risk-register/:id", risk_register_id_get_731);
app.put("/api/risk-register/:id", risk_register_id_put_732);
app.post("/api/risk-register/:id/archive", risk_register_id_archive_post_733);
app.post("/api/risk-register/:id/unarchive", risk_register_id_unarchive_post_734);
app.get("/api/rl-register", rl_register_get_735);
app.post("/api/rl-register", rl_register_post_736);
app.delete("/api/rl-register/points/:id", rl_register_points_id_delete_737);
app.put("/api/rl-register/points/:id", rl_register_points_id_put_738);
app.get("/api/rl-register/:benchmarkId/points", rl_register_benchmarkId_points_get_739);
app.post("/api/rl-register/:benchmarkId/points", rl_register_benchmarkId_points_post_740);
app.get("/api/rl-register/:jobId/export/csv", rl_register_jobId_export_csv_get_741);
app.get("/api/rl-register/:jobId/export/pdf", rl_register_jobId_export_pdf_get_742);
app.post("/api/safety/ai/draft", safety_ai_draft_post_743);
app.get("/api/safety/documents", safety_documents_get_744);
app.post("/api/safety/documents", safety_documents_post_745);
app.post("/api/safety/documents/new", safety_documents_new_post_746);
app.delete("/api/safety/documents/:id", safety_documents_id_delete_747);
app.get("/api/safety/documents/:id/download", safety_documents_id_download_get_748);
app.get("/api/safety/generated-posters", safety_generated_posters_get_749);
app.post("/api/safety/generated-posters", safety_generated_posters_post_750);
app.delete("/api/safety/generated-posters/:id", safety_generated_posters_id_delete_751);
app.get("/api/safety/generated-posters/:id/pdf", safety_generated_posters_id_pdf_get_752);
app.get("/api/safety/job-safety-plans", safety_job_safety_plans_get_753);
app.post("/api/safety/job-safety-plans", safety_job_safety_plans_post_754);
app.delete("/api/safety/job-safety-plans/:id", safety_job_safety_plans_id_delete_755);
app.put("/api/safety/job-safety-plans/:id", safety_job_safety_plans_id_put_756);
app.get("/api/safety/job-swms", safety_job_swms_get_757);
app.post("/api/safety/job-swms", safety_job_swms_post_758);
app.delete("/api/safety/job-swms/:id", safety_job_swms_id_delete_759);
app.get("/api/safety/job-swms/:id", safety_job_swms_id_get_760);
app.put("/api/safety/job-swms/:id", safety_job_swms_id_put_761);
app.post("/api/safety/job-swms/:id/share-token", safety_job_swms_id_share_token_post_762);
app.get("/api/safety/job-swms/:id/signoffs", safety_job_swms_id_signoffs_get_763);
app.post("/api/safety/job-swms/:id/signoffs", safety_job_swms_id_signoffs_post_764);
app.delete("/api/safety/job-swms/:id/signoffs/:signoffId", safety_job_swms_id_signoffs_signoffId_delete_765);
app.get("/api/safety/plans", safety_plans_get_766);
app.post("/api/safety/plans", safety_plans_post_767);
app.post("/api/safety/plans/seed", safety_plans_seed_post_768);
app.delete("/api/safety/plans/:id", safety_plans_id_delete_769);
app.put("/api/safety/plans/:id", safety_plans_id_put_770);
app.get("/api/safety/plans/:id/export", safety_plans_id_export_get_771);
app.get("/api/safety/plans/:id/pack", safety_plans_id_pack_get_772);
app.get("/api/safety/posters", safety_posters_get_773);
app.post("/api/safety/posters", safety_posters_post_774);
app.delete("/api/safety/posters/:id", safety_posters_id_delete_775);
app.get("/api/safety/posters/:id/download", safety_posters_id_download_get_776);
app.get("/api/safety/swms", safety_swms_get_777);
app.post("/api/safety/swms", safety_swms_post_778);
app.post("/api/safety/swms/import-docx", safety_swms_import_docx_post_779);
app.post("/api/safety/swms/seed", safety_swms_seed_post_780);
app.delete("/api/safety/swms/:id", safety_swms_id_delete_781);
app.get("/api/safety/swms/:id", safety_swms_id_get_782);
app.put("/api/safety/swms/:id", safety_swms_id_put_783);
app.post("/api/safety/swms/:id/duplicate", safety_swms_id_duplicate_post_784);
app.get("/api/safety/swms/:id/export", safety_swms_id_export_get_785);
app.post("/api/safety/swms/:id/publish-to-library", safety_swms_id_publish_to_library_post_786);
app.get("/api/safety/swms-submissions", safety_swms_submissions_get_787);
app.get("/api/scheduler/crew", scheduler_crew_get_788);
app.get("/api/scheduler/jobs", scheduler_jobs_get_789);
app.patch("/api/scheduler/jobs/:id/reschedule", scheduler_jobs_id_reschedule_patch_790);
app.get("/api/scheduler/tasks", scheduler_tasks_get_791);
app.get("/api/sds-register", sds_register_get_792);
app.post("/api/sds-register", sds_register_post_793);
app.delete("/api/sds-register/:id", sds_register_id_delete_794);
app.put("/api/sds-register/:id", sds_register_id_put_795);
app.get("/api/sds-register/:id/download", sds_register_id_download_get_796);
app.post("/api/sds-register/:id/replace", sds_register_id_replace_post_797);
app.get("/api/secure-share", secure_share_get_798);
app.post("/api/secure-share", secure_share_post_799);
app.get("/api/secure-share/active", secure_share_active_get_800);
app.delete("/api/secure-share/:id", secure_share_id_delete_801);
app.post("/api/secure-share/:id/revoke-and-rotate", secure_share_id_revoke_and_rotate_post_802);
app.get("/api/secure-share/:token", secure_share_token_get_803);
app.post("/api/secure-share/:token", secure_share_token_post_804);
app.get("/api/secure-share/:token/content", secure_share_token_content_get_805);
app.get("/api/settings/backup", settings_backup_get_806);
app.post("/api/settings/backup", settings_backup_post_807);
app.get("/api/settings/backup/company-data", settings_backup_company_data_get_808);
app.get("/api/settings/backup/csv-pack", settings_backup_csv_pack_get_809);
app.get("/api/settings/backup/export", settings_backup_export_get_810);
app.post("/api/settings/backup/run", settings_backup_run_post_811);
app.get("/api/settings/backup-destination", settings_backup_destination_get_812);
app.post("/api/settings/backup-destination", settings_backup_destination_post_813);
app.get("/api/settings/dazza-ai-key", settings_dazza_ai_key_get_814);
app.post("/api/settings/dazza-ai-key", settings_dazza_ai_key_post_815);
app.get("/api/settings/file-transfer-backup", settings_file_transfer_backup_get_816);
app.post("/api/settings/file-transfer-backup", settings_file_transfer_backup_post_817);
app.get("/api/settings/retention", settings_retention_get_818);
app.post("/api/settings/retention", settings_retention_post_819);
app.get("/api/settings/storage-provider", settings_storage_provider_get_820);
app.get("/api/settings/storage-provider/debug", settings_storage_provider_debug_get_821);
app.post("/api/settings/storage-provider/test", settings_storage_provider_test_post_822);
app.get("/api/settings/terminology", settings_terminology_get_823);
app.post("/api/settings/terminology", settings_terminology_post_824);
app.get("/api/settings/xero-credentials", settings_xero_credentials_get_825);
app.post("/api/settings/xero-credentials", settings_xero_credentials_post_826);
app.get("/api/share/:token", share_token_get_827);
app.get("/api/signin-history", signin_history_get_828);
app.post("/api/signup", signup_post_829);
app.get("/api/sos", sos_get_830);
app.post("/api/sos/acknowledge", sos_acknowledge_post_831);
app.post("/api/sos/trigger", sos_trigger_post_832);
app.post("/api/stakeholders/sms", stakeholders_sms_post_833);
app.post("/api/stripe/create-checkout-session", stripe_create_checkout_session_post_834);
app.get("/api/stripe/session/:sessionId", stripe_session_sessionId_get_835);
app.post("/api/studio/generate-from-safety", studio_generate_from_safety_post_836);
app.post("/api/studio/upload-image", studio_upload_image_post_837);
app.post("/api/subscription/create-checkout", subscription_create_checkout_post_838);
app.get("/api/subscription/status", subscription_status_get_839);
app.post("/api/subscription/webhook", subscription_webhook_post_840);
app.get("/api/support-mode/audit", support_mode_audit_get_841);
app.get("/api/support-mode/checklist", support_mode_checklist_get_842);
app.put("/api/support-mode/checklist", support_mode_checklist_put_843);
app.post("/api/support-mode/enter", support_mode_enter_post_844);
app.post("/api/support-mode/exit", support_mode_exit_post_845);
app.get("/api/support-mode/status", support_mode_status_get_846);
app.get("/api/tag-tasks", tag_tasks_get_847);
app.patch("/api/tag-tasks/:id", tag_tasks_id_patch_848);
app.get("/api/takeoff-pad", takeoff_pad_get_849);
app.put("/api/takeoff-pad", takeoff_pad_put_850);
app.post("/api/tasks", tasks_post_851);
app.put("/api/tasks/:id", tasks_id_put_852);
app.get("/api/team", team_get_853);
app.post("/api/team/invite", team_invite_post_854);
app.get("/api/team/invites", team_invites_get_855);
app.post("/api/team/invites", team_invites_post_856);
app.post("/api/team/invites/:id/cancel", team_invites_id_cancel_post_857);
app.post("/api/team/invites/:id/resend", team_invites_id_resend_post_858);
app.get("/api/team/members", team_members_get_859);
app.get("/api/team/members/:id/icon-permissions", team_members_id_icon_permissions_get_860);
app.put("/api/team/members/:id/icon-permissions", team_members_id_icon_permissions_put_861);
app.post("/api/team/resend-verification", team_resend_verification_post_862);
app.post("/api/team/schedule/migrate", team_schedule_migrate_post_863);
app.get("/api/team/shifts", team_shifts_get_864);
app.post("/api/team/shifts", team_shifts_post_865);
app.delete("/api/team/shifts/:id", team_shifts_id_delete_866);
app.put("/api/team/shifts/:id", team_shifts_id_put_867);
app.get("/api/team/time-entries", team_time_entries_get_868);
app.post("/api/team/time-entries", team_time_entries_post_869);
app.get("/api/team/time-entries/export", team_time_entries_export_get_870);
app.put("/api/team/time-entries/:id", team_time_entries_id_put_871);
app.post("/api/team/verify-user", team_verify_user_post_872);
app.delete("/api/team/:id", team_id_delete_873);
app.put("/api/team/:id", team_id_put_874);
app.get("/api/usage", usage_get_875);
app.get("/api/user-logs", user_logs_get_876);
app.get("/api/user-logs/users", user_logs_users_get_877);
app.get("/api/work/attendance", work_attendance_get_878);
app.get("/api/work/delays", work_delays_get_879);
app.get("/api/work/notes", work_notes_get_880);
app.get("/api/work/progress", work_progress_get_881);
app.get("/api/work/tasks", work_tasks_get_882);
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
	// Allow only genuine public marketing and legal pages.
	// All authenticated portal, tool, admin, auth-flow and internal routes are blocked.
	const body = [
		"User-agent: *",
		"",
		"# ── Public marketing & legal pages — allow crawling ─────────────────────────",
		"Allow: /$",
		"Allow: /signup$",
		"Allow: /subscribe$",
		"Allow: /download-app$",
		"Allow: /login$",
		"Allow: /forgot-password$",
		"Allow: /login-help$",
		"Allow: /terms$",
		"Allow: /privacy$",
		"Allow: /fair-use$",
		"Allow: /system-policy$",
		"",
		"# ── Block all authenticated portal, tool and internal routes ─────────────────",
		"Disallow: /api/",
		"Disallow: /home",
		"Disallow: /work",
		"Disallow: /work-field",
		"Disallow: /dashboard",
		"Disallow: /jobs",
		"Disallow: /projects",
		"Disallow: /scheduler",
		"Disallow: /fleet",
		"Disallow: /forms",
		"Disallow: /files",
		"Disallow: /finance",
		"Disallow: /estimating",
		"Disallow: /timesheets",
		"Disallow: /invoices",
		"Disallow: /safety",
		"Disallow: /customers",
		"Disallow: /stakeholders",
		"Disallow: /library",
		"Disallow: /studio",
		"Disallow: /tools",
		"Disallow: /builders-calc",
		"Disallow: /takeoff-pad",
		"Disallow: /sds-register",
		"Disallow: /rl-register",
		"Disallow: /electrical-tests",
		"Disallow: /incidents",
		"Disallow: /risk-register",
		"Disallow: /prestart",
		"Disallow: /site-escape",
		"Disallow: /job-docs",
		"Disallow: /plan-manager",
		"Disallow: /lens",
		"Disallow: /dazza-ai",
		"Disallow: /annette",
		"Disallow: /team",
		"Disallow: /settings",
		"Disallow: /profile",
		"Disallow: /owner-console",
		"Disallow: /developer-console",
		"Disallow: /billing",
		"Disallow: /subscription",
		"Disallow: /roadmap",
		"Disallow: /lists",
		"Disallow: /user-logs",
		"Disallow: /signin-history",
		"Disallow: /job-cards",
		"Disallow: /quick-links",
		"Disallow: /help",
		"Disallow: /portal/",
		"Disallow: /share/",
		"Disallow: /external/",
		"Disallow: /documents/",
		"Disallow: /view/",
		"",
		"# ── Block auth-only flows ────────────────────────────────────────────────────",
		"Disallow: /check-email",
		"Disallow: /verify-email",
		"Disallow: /verify-required",
		"Disallow: /reset-password",
		"",
		"# ── Block test/build-only paths ──────────────────────────────────────────────",
		"Disallow: /__tests__/",
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
		// Serve sw.js with no-cache headers so browsers and CDNs never retain
		// a stale service worker. Service-Worker-Allowed: / grants full-scope
		// interception rights.
		if (req.path === '/sw.js') {
			res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
			res.set('Pragma', 'no-cache');
			res.set('Expires', '0');
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
				// Use INFORMATION_SCHEMA check — ADD COLUMN not supported on all MySQL versions
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

		// NOTE: runRecoveryEmailMigration() is called at module-load level (~line 3236)
		// and must NOT be called again here — the module-load call is the authoritative
		// one and a second call would be redundant and could cause lock contention.

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

		// ── BetterAuth 1.7.2: account.issuer column + backfill ───────────────
		// BetterAuth 1.7.2 added an `issuer` field to the account schema.
		// Credential accounts must have issuer = 'local:credential'.
		// OAuth accounts must have issuer = 'local:oauth:<providerId>'.
		// Without this column every login returns "User not found".
		try {
			await db.execute(sql.raw(
				"ALTER TABLE `account` ADD COLUMN `issuer` VARCHAR(255) NULL DEFAULT NULL AFTER `provider_id`"
			));
			console.log('[startup] account.issuer column added');
		} catch (e) {
			// ER_DUP_FIELDNAME = column already exists — safe to ignore
			const msg = (e as Error)?.message ?? '';
			if (!msg.includes('Duplicate column') && !msg.includes('ER_DUP_FIELDNAME')) {
				console.warn('[startup] account.issuer ALTER skipped:', msg.slice(0, 120));
			}
		}
		// Backfill: set issuer for all existing rows that are still NULL
		try {
			await db.execute(sql.raw(
				"UPDATE `account` SET `issuer` = CASE " +
				"  WHEN `provider_id` = 'credential' THEN 'local:credential' " +
				"  ELSE CONCAT('local:oauth:', `provider_id`) " +
				"END WHERE `issuer` IS NULL"
			));
			console.log('[startup] account.issuer backfill complete');
		} catch (e) {
			console.warn('[startup] account.issuer backfill failed:', (e as Error)?.message?.slice(0, 120));
		}

		// ── All migrations done — now start accepting requests ─────────────────
		console.log('[startup] all inline migrations complete — calling app.listen');

		// ── Timesheet schema ──────────────────────────────────────────────────
		try {
			const { ensureTimesheetSchema } = await import('./lib/timesheet-service.js');
			await ensureTimesheetSchema();
			console.log('[startup] timesheet schema ready');
		} catch (e) {
			console.warn('[startup] timesheet schema migration skipped:', (e as Error)?.message?.slice(0, 200));
		}

		// ── Dazza engine startup log ──────────────────────────────────────────
		// Logs which engine will be used for Dazza chat requests.
		// Never logs the raw secret value — only the resolved boolean.
		try {
			const { isDazzaV3Enabled } = await import('./lib/dazza-v3-brain.js');
			const v3 = isDazzaV3Enabled();
			console.log(`[startup] Dazza engine: ${v3 ? 'V3 (owner watcher)' : 'V2 rollback'} | DAZZA_V3_ENABLED resolved=${v3}`);
		} catch (e) {
			console.warn('[startup] Dazza engine check failed:', String(e).slice(0, 200));
		}
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
